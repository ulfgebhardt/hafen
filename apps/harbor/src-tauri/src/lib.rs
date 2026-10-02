//! The window's shell.
//!
//! Seven commands, and every one of them is *named*. There is still no shell permission and no
//! filesystem plugin: the webview cannot run a command of its own choosing, cannot name a file to
//! write, and cannot pass an argument this file did not decide the shape of. A string from the
//! page only ever lands in the one position its caller put it in — and for the tools, that
//! position is a working directory.
//!
//! **The promise, and how far it has moved.** It began as: the window runs nothing at all. That
//! was too strong for what it protected — a harbour whose only way to refresh was a terminal is a
//! harbour that shows yesterday. It then became: the harbour changes no repository. That is still
//! the line, and here is exactly where it now runs:
//!
//! - **Measuring** reads `git` and writes the cache. Nothing in a repository moves.
//! - **The register** is written, and what stands in it is a decision a person made.
//! - **Tools hand over.** `lazygit`, an editor, a terminal, an agent — the window opens them in a
//!   directory and a human decides inside. The harbour itself still changes nothing.
//! - **Two writes, both narrow.** `git remote prune origin` removes remote-tracking refs for
//!   branches the remote no longer has: no commit, no local branch, nothing anybody made. And
//!   `git branch -d`, one branch at a time, where git's own refusal is the safety — never `-D`,
//!   which would be a promise about somebody's work that this window cannot keep.
//!
//! What has *not* moved: nothing here commits, pushes, merges, rebases or resets, and no sweep
//! deletes more than one thing per click.
//!
//! Neither measuring nor the register's format lives here. `hafen schnappschuss` walks the
//! repositories, `hafen register` edits the register, and this runs them. A Rust half that knew
//! the register's format would be a second opinion about a file both of them edit.
//!
//! Read at runtime rather than bundled with the frontend, which is the difference between a
//! desktop app and a screenshot: a snapshot baked in at build time is as old as the build, and
//! nothing on screen would say so.

mod ports;

use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::Manager;

/// What X claims every screen is, and mostly is not.
const ASSUMED_DPI: f64 = 96.0;

/// Past this a window is not "readable" any more, it is a magnifier.
const MAX_ZOOM: f64 = 3.0;

/// `WidthMM`/`HeightMM` out of `xrandr --query`, as dots per inch.
///
/// The connected primary only: a laptop panel beside a projector has two honest answers, and the
/// one the human is looking at is the one the window opens on.
fn parse_dpi(output: &str) -> Option<f64> {
    let line = output.lines().find(|line| line.contains(" connected"))?;
    let resolution = line
        .split_whitespace()
        .find(|word| word.contains('x') && word.contains('+'))?;
    let pixels: f64 = resolution.split('x').next()?.parse().ok()?;
    let millimetres: f64 = line
        .split_whitespace()
        .zip(line.split_whitespace().skip(1))
        .find_map(|(value, unit)| {
            (unit == "x").then(|| value.trim_end_matches("mm").parse().ok())?
        })?;

    (pixels > 0.0 && millimetres > 0.0).then(|| pixels / (millimetres / 25.4))
}

fn display_dpi() -> Option<f64> {
    let output = std::process::Command::new("xrandr")
        .arg("--query")
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| parse_dpi(&String::from_utf8_lossy(&output.stdout)))?
}

/// How large to draw, before anybody has said anything.
///
/// Measured on the machine this was written for: a 2560x1440 panel of 309 mm is 210 dpi, while X
/// reports 96 — so everything lands at under half its intended size, and a human who scaled their
/// desktop by hand still gets a window that ignores it. The order is therefore: what was said
/// explicitly, then what the desktop already configured, and only then the screen itself.
///
/// Reading the screen is the branch that matters here, because on this desktop neither `GDK_SCALE`
/// nor `GDK_DPI_SCALE` is set and `Xft.dpi` says 96 — measuring beats believing the claim.
fn zoom_from(env: &dyn Fn(&str) -> Option<String>, dpi: Option<f64>) -> f64 {
    let read = |name: &str| {
        env(name)?
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|value| *value > 0.0)
    };

    if let Some(explicit) = read("HAFEN_ZOOM") {
        return explicit.min(MAX_ZOOM);
    }
    if let (None, None) = (read("GDK_SCALE"), read("GDK_DPI_SCALE")) {
        // Quarter steps: finer is below what anyone can see, coarser jumps past comfortable.
        return dpi
            .map(|value| ((value / ASSUMED_DPI) * 4.0).round() / 4.0)
            .filter(|factor| *factor > 1.0)
            .unwrap_or(1.0)
            .min(MAX_ZOOM);
    }
    (read("GDK_SCALE").unwrap_or(1.0) * read("GDK_DPI_SCALE").unwrap_or(1.0)).min(MAX_ZOOM)
}

/// The same answer the window uses, callable from a terminal — so "warum ist es immer noch klein"
/// can be checked rather than guessed at.
pub fn zoom() -> f64 {
    zoom_from(&|name| std::env::var(name).ok(), display_dpi())
}

/** The two cache files the window may read or write, by name. A page says *which*, never *where*. */
const CACHES: [&str; 2] = ["snapshot", "forge"];

/// Where the snapshot lies, and what was found there.
///
/// The path travels with the answer in *both* directions, because the only useful thing to say
/// about a missing snapshot is where it was looked for. An error without it sends a human
/// searching for a file the program already knows the name of.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub path: String,
    /// The file's contents, parsed by the webview. `None` when it could not be read.
    pub json: Option<String>,
    /// Why not. `None` exactly when `json` is `Some` — the two are never both set.
    pub error: Option<String>,
}

/// `$HAFEN_SNAPSHOT`, else `$XDG_CACHE_HOME/hafen/snapshot.json`, else `~/.cache/hafen/…`.
///
/// A cache path and not a data path on purpose: deleting it must cost nothing but the next
/// measurement. The override exists so a second fleet — or a test — can be pointed elsewhere,
/// the same reason `HAFEN_STORE` exists on the CLI side.
fn snapshot_path() -> Option<PathBuf> {
    if let Ok(given) = std::env::var("HAFEN_SNAPSHOT") {
        if !given.is_empty() {
            return Some(PathBuf::from(given));
        }
    }

    let cache = std::env::var("XDG_CACHE_HOME")
        .ok()
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|home| PathBuf::from(home).join(".cache"))
        })?;

    Some(cache.join("hafen").join("snapshot.json"))
}

/// Reads one of the two cache files. `which` names it; the path is built here, never passed in.
/**
 * Where one of the two cache files lies.
 *
 * The snapshot keeps `snapshot_path()` exactly, override and all: `$HAFEN_SNAPSHOT` names a *file*
 * and a second fleet is pointed at it by name, so rebuilding that name from a cache key would
 * throw the override's own filename away — which it did, and a test caught it. The forge reading
 * is the one that is placed *beside* it.
 */
fn cache_path(name: &str) -> Option<PathBuf> {
    let base = snapshot_path()?;
    if name == "snapshot" {
        return Some(base);
    }
    Some(base.with_file_name(format!("{name}.json")))
}

#[tauri::command]
fn snapshot(which: Option<String>) -> Snapshot {
    let name = which.unwrap_or_else(|| "snapshot".to_owned());
    if !CACHES.contains(&name.as_str()) {
        return Snapshot {
            path: "(unbekannt)".to_owned(),
            json: None,
            error: Some(format!("unbekannter Cache: {name}")),
        };
    }

    let Some(path) = cache_path(&name) else {
        return Snapshot {
            path: "(unbekannt)".to_owned(),
            json: None,
            error: Some(
                "weder HAFEN_SNAPSHOT noch XDG_CACHE_HOME noch HOME sind gesetzt".to_owned(),
            ),
        };
    };

    let shown = path.display().to_string();
    match std::fs::read_to_string(&path) {
        Ok(json) => Snapshot {
            path: shown,
            json: Some(json),
            error: None,
        },
        Err(error) => Snapshot {
            path: shown,
            json: None,
            error: Some(error.to_string()),
        },
    }
}

/// How to call the measuring half.
///
/// `$HAFEN_CLI` first, split on spaces so a development checkout can point at
/// `pnpm --filter @hafen/cli exec tsx src/index.ts` without a wrapper script. Then plain `hafen`
/// on the PATH, which is what an installed one is. Deliberately not a path baked in at build time:
/// that is the setting that is wrong on every machine except the one it was built on.
fn cli() -> Vec<String> {
    match std::env::var("HAFEN_CLI") {
        Ok(given) if !given.trim().is_empty() => {
            given.split_whitespace().map(str::to_owned).collect()
        }
        _ => vec!["hafen".to_owned()],
    }
}

/// Runs the CLI with arguments this file chose, and hands back what it printed.
///
/// Every caller below builds its own argument list from a fixed shape. Nothing the webview sends
/// is ever a command, a flag or a path that is not checked first — a string from the page can only
/// ever land in the one position the caller put it in.
fn run_cli(args: &[String]) -> Result<String, String> {
    let parts = cli();
    let (program, leading) = parts.split_first().ok_or("HAFEN_CLI ist leer")?;

    let output = std::process::Command::new(program)
        .args(leading)
        .args(args)
        .output()
        // The remedy and not only the failure: "No such file or directory" beside a word the
        // reader never typed sends them looking for a bug. What is missing is a setting.
        .map_err(|error| {
            format!(
                "{program} nicht ausführbar: {error}\n\
                 Der Hafen misst über seine CLI. Entweder `hafen` auf den PATH legen, oder \
                 HAFEN_CLI setzen — im Checkout etwa auf \
                 \"pnpm --filter @hafen/cli exec tsx src/index.ts\"."
            )
        })?;

    if !output.status.success() {
        let said = String::from_utf8_lossy(&output.stderr);
        let reason = said.trim();
        // The exit code alone sends a person reading a manual; what it printed is the answer.
        return Err(if reason.is_empty() {
            format!("{program} endete mit {}", output.status)
        } else {
            reason.to_owned()
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// What a measurement answered: the snapshot as text, or why there is none.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Measured {
    pub json: Option<String>,
    pub error: Option<String>,
}

impl Measured {
    fn of(result: Result<String, String>) -> Self {
        match result {
            Ok(json) => Self {
                json: Some(json),
                error: None,
            },
            Err(error) => Self {
                json: None,
                error: Some(error),
            },
        }
    }
}

/// Measures the fleet, or one repository of it.
///
/// `only` is a path and lands in `--nur=…`, which is the one place a string from the page reaches
/// the CLI — as the value of a flag this file names, never as a flag of its own. A full survey is
/// ninety repositories and some seconds; asking for all of them to learn what one just did is the
/// reason refreshing felt like something to avoid.
///
/// Nothing is written here. The window merges the answer into what it has and asks for `store`,
/// because the merge needs to know what a snapshot is and this file deliberately does not.
/**
 * Asks the forges what they say about these repositories.
 *
 * Its own command and never folded into `measure`, which is the whole design: the survey reads the
 * disk and asks nobody anything, this one goes to the network. Two readings, two files, two
 * timestamps — and the window shows both, because they really are two different ages.
 */
#[tauri::command]
fn forge() -> Measured {
    Measured::of(run_cli(&["forge".to_owned()]))
}

/// How far a running survey has got.
///
/// A survey is ninety repositories and some seconds, and for all of them the window could say
/// nothing but "misst …". Worse, the command ran on the main thread, so the picture froze while
/// it did. It is read by polling rather than pushed as an event: the frontend reaches Tauri
/// through `__TAURI_INTERNALS__` and carries no `@tauri-apps/api`, so a command it can already
/// call beats a channel it would have to grow a dependency for.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// How many are done, and how many there are. `of` is 0 until the survey has counted.
    pub at: usize,
    pub of: usize,
    /// The repository that just landed — a path, so the window can name it.
    pub path: String,
    pub running: bool,
    /// Whether somebody asked it to stop. Stays true until the next survey starts.
    pub stopped: bool,
}

static PROGRESS: Mutex<Progress> = Mutex::new(Progress {
    at: 0,
    of: 0,
    path: String::new(),
    running: false,
    stopped: false,
});

/// The child doing the measuring, so it can be stopped.
static SURVEY: Mutex<Option<Child>> = Mutex::new(None);

/// One line of `--fortschritt`, folded into what is known.
///
/// Parsed by hand and not with serde: two shapes of one object, both tiny, and a malformed line
/// is a line to ignore rather than a reason to lose the survey. The CLI writes them, so a parser
/// that is strict about them would be strict about ourselves.
fn note(line: &str) {
    let Ok(mut progress) = PROGRESS.lock() else {
        return;
    };
    if let Some(count) = field(line, "\"of\":") {
        progress.of = count.parse().unwrap_or(0);
        return;
    }
    if let Some(at) = field(line, "\"at\":") {
        progress.at = at.parse().unwrap_or(progress.at);
    }
    if let Some(start) = line.find("\"path\":\"") {
        let rest = &line[start + 8..];
        if let Some(end) = rest.find('"') {
            progress.path = rest[..end].to_owned();
        }
    }
}

/// The number after a key, where the line carries one.
fn field(line: &str, key: &str) -> Option<String> {
    let start = line.find(key)? + key.len();
    let rest = &line[start..];
    let end = rest
        .find(|one: char| !one.is_ascii_digit())
        .unwrap_or(rest.len());
    let digits = &rest[..end];
    if digits.is_empty() {
        None
    } else {
        Some(digits.to_owned())
    }
}

/// Runs the CLI and watches it work.
///
/// Both pipes are read at once, and that is not a detail: a snapshot of this fleet is about one
/// and a half megabytes and a pipe holds sixty-four kilobytes, so reading the progress first and
/// the answer afterwards would block the child on a full stdout and hang for ever. The answer is
/// collected on its own thread while this one reads the lines.
fn run_watched(args: &[String]) -> Result<String, String> {
    let parts = cli();
    let (program, leading) = parts.split_first().ok_or("HAFEN_CLI ist leer")?;
    let mut child = std::process::Command::new(program)
        .args(leading)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("{program} nicht ausführbar: {error}"))?;

    let Some(mut out) = child.stdout.take() else {
        return Err("kein Kanal zur CLI".to_owned());
    };
    let Some(said) = child.stderr.take() else {
        return Err("kein Kanal zur CLI".to_owned());
    };
    let collecting = std::thread::spawn(move || {
        let mut text = String::new();
        let _ = out.read_to_string(&mut text);
        text
    });
    if let Ok(mut running) = SURVEY.lock() {
        *running = Some(child);
    }

    let mut complaints: Vec<String> = Vec::new();
    for line in BufReader::new(said).lines().map_while(Result::ok) {
        if line.contains("\"at\":") || line.contains("\"of\":") {
            note(&line);
            continue;
        }
        complaints.push(line);
    }
    let json = collecting.join().unwrap_or_default();
    let status = SURVEY
        .lock()
        .ok()
        .and_then(|mut running| running.take())
        .and_then(|mut child| child.wait().ok());

    let stopped = PROGRESS.lock().map(|one| one.stopped).unwrap_or(false);
    if stopped {
        return Err("abgebrochen".to_owned());
    }
    match status {
        Some(code) if code.success() => Ok(json),
        _ => Err(complaints
            .into_iter()
            .next_back()
            .unwrap_or_else(|| "die Messung endete ohne Ergebnis".to_owned())),
    }
}

#[tauri::command]
async fn measure(only: Option<String>) -> Measured {
    let mut args = vec!["schnappschuss".to_owned(), "--fortschritt".to_owned()];
    let whole = match only.filter(|path| !path.trim().is_empty()) {
        Some(path) => {
            args.push(format!("--nur={path}"));
            false
        }
        None => true,
    };
    if let Ok(mut progress) = PROGRESS.lock() {
        *progress = Progress {
            at: 0,
            // One repository does not count itself: the window knows it asked for one.
            of: if whole { 0 } else { 1 },
            path: String::new(),
            running: true,
            stopped: false,
        };
    }
    let answer = run_watched(&args);
    if let Ok(mut progress) = PROGRESS.lock() {
        progress.running = false;
    }
    Measured::of(answer)
}

/// How far the survey has got. Polled by the window while the bar is up.
#[tauri::command]
fn measure_progress() -> Progress {
    PROGRESS.lock().map(|one| one.clone()).unwrap_or_default()
}

/// Stop measuring.
///
/// Kills the child rather than asking it to stop: the survey is a separate process reading
/// repositories, it writes nothing, and the snapshot it would have produced is simply never
/// written. Nothing is half-done afterwards — the cache still holds the last complete one.
#[tauri::command]
fn measure_cancel() -> Option<String> {
    if let Ok(mut progress) = PROGRESS.lock() {
        if !progress.running {
            return None;
        }
        progress.stopped = true;
    }
    let Ok(mut running) = SURVEY.lock() else {
        return Some("die Messung ließ sich nicht erreichen".to_owned());
    };
    match running.as_mut() {
        Some(child) => child
            .kill()
            .err()
            .map(|error| format!("Abbruch fehlgeschlagen: {error}")),
        None => None,
    }
}

/// Writes one of the two cache files.
///
/// The path is not an argument and cannot be: the page names one of `CACHES` and this builds the
/// rest. Through a temporary file and a rename, so a window reading the cache while this runs sees
/// either the old file or the new one and never half of one.
#[tauri::command]
fn store(json: String, which: Option<String>) -> Option<String> {
    let name = which.unwrap_or_else(|| "snapshot".to_owned());
    if !CACHES.contains(&name.as_str()) {
        return Some(format!("unbekannter Cache: {name}"));
    }
    let path = cache_path(&name)?;
    if let Some(directory) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(directory) {
            return Some(error.to_string());
        }
    }

    let temporary = path.with_extension("json.neu");
    if let Err(error) = std::fs::write(&temporary, json) {
        return Some(error.to_string());
    }
    std::fs::rename(&temporary, &path)
        .err()
        .map(|error| error.to_string())
}

/// The four things the register can be told, and nothing else.
///
/// Checked here rather than passed through, so a typo in the page is a refusal and not an argument
/// handed to a process. The words are the CLI's own — one vocabulary, not a mapping table that can
/// drift out of step with the tool it names.
const REGISTER_ACTIONS: [&str; 4] = ["archivieren", "reaktivieren", "aufnehmen", "entfernen"];

/// Puts a repository away, fetches it back, takes a directory on, or drops it.
///
/// The one writing path in the whole window, and it writes the register — decisions a person made.
/// Nothing measured goes through here, and no path inside a project repository.
#[tauri::command]
fn register(action: String, path: String) -> Option<String> {
    if !REGISTER_ACTIONS.contains(&action.as_str()) {
        return Some(format!("unbekannte Registeraktion: {action}"));
    }
    if path.trim().is_empty() {
        return Some("kein Pfad angegeben".to_owned());
    }
    run_cli(&["register".to_owned(), action, path]).err()
}

/**
 * Which terminal to open a terminal tool in.
 *
 * `$HAFEN_TERMINAL` first, then whatever of the usual ones is on the PATH. Measured and not
 * assumed: a hardcoded `xterm` is the setting that is wrong on every desktop except one, and a
 * button that fails in the click is worse than no button — so the window asks `tools()` which of
 * these exist before it draws any of them.
 */
const TERMINALS: [&str; 6] = ["alacritty", "kitty", "wezterm", "foot", "konsole", "xterm"];

fn terminal() -> Option<String> {
    if let Ok(given) = std::env::var("HAFEN_TERMINAL") {
        if !given.trim().is_empty() {
            return Some(given.trim().to_owned());
        }
    }
    TERMINALS
        .iter()
        .find(|name| on_path(name))
        .map(|name| (*name).to_owned())
}

/**
 * The shell to open where the window is asked for "a terminal here".
 *
 * The **login** shell and not `$SHELL`: that variable is only what the process which started this
 * window happened to carry, and a window started from a desktop file inherits whatever the
 * session manager had — which is how a machine whose shell is fish ended up with a bash prompt.
 * `/etc/passwd` is where the system records the answer, so that is what is read. `$HAFEN_SHELL`
 * overrides it, the same way `$HAFEN_TERMINAL` overrides the terminal.
 */
fn user_shell() -> Option<String> {
    if let Ok(given) = std::env::var("HAFEN_SHELL") {
        if !given.trim().is_empty() {
            return Some(given.trim().to_owned());
        }
    }
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .ok()?;
    let passwd = std::fs::read_to_string("/etc/passwd").ok()?;
    shell_in_passwd(&passwd, &user).or_else(|| {
        // No passwd on this system — Windows has none — so the variable is what is left.
        std::env::var("SHELL")
            .ok()
            .filter(|one| !one.trim().is_empty())
    })
}

/// The seventh field of this user's line. Pure, so the parsing can be tested without a machine.
fn shell_in_passwd(passwd: &str, user: &str) -> Option<String> {
    passwd
        .lines()
        .find(|line| line.starts_with(&format!("{user}:")))
        .and_then(|line| line.split(':').nth(6))
        .map(str::trim)
        .filter(|shell| !shell.is_empty())
        .map(str::to_owned)
}

/// Whether a command exists, asked the way a shell asks.
fn on_path(command: &str) -> bool {
    let Ok(paths) = std::env::var("PATH") else {
        return false;
    };
    let names = executables(command, cfg!(windows), std::env::var("PATHEXT").ok());
    std::env::split_paths(&paths).any(|dir| names.iter().any(|name| dir.join(name).is_file()))
}

/// What one command may be called on disk.
///
/// On Windows an executable carries its extension and `PATH` does not: `git` is `git.exe` there,
/// so looking for the bare name found nothing and the window offered no tools at all — which is
/// how the Windows runner first noticed. `PATHEXT` is the list the shell itself uses, and the
/// bare name stays first because a file without an extension is still a file.
///
/// Takes the platform and the variable rather than reading them, so the Windows case can be
/// tested on any machine. A `cfg!` inside would be a branch that only one runner ever enters.
pub(crate) fn executables(command: &str, windows: bool, pathext: Option<String>) -> Vec<String> {
    let mut names = vec![command.to_owned()];
    if !windows {
        return names;
    }
    let listed = pathext.unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_owned());
    names.extend(
        listed
            .split(';')
            .map(str::trim)
            .filter(|one| !one.is_empty())
            .map(|one| format!("{command}{}", one.to_lowercase())),
    );
    names
}

/// What a tool is: a program, and whether it needs a terminal around it.
struct Tool {
    /// The program the button stands for — what has to exist for it to be offered.
    program: &'static str,
    /// Arguments after the program. The path is the working directory, never an argument.
    args: &'static [&'static str],
    /// Whether it has to be wrapped in a terminal emulator.
    terminal: bool,
}

/**
 * Everything the window may start, by name.
 *
 * A closed list, the same shape `register` uses and for the same reason: a name the page sends is
 * checked here and turned into a fixed argv, so nothing from the webview is ever a program, a flag
 * or anything but a working directory.
 *
 * **What this does and does not break.** The harbour still changes no repository by itself. Four
 * of these five *hand over* — they open a tool and a human decides inside it. The fifth,
 * `git remote prune origin`, does write, and it is the one write worth having: it deletes
 * remote-tracking refs for branches that no longer exist on the remote. No commit, no local
 * branch, nothing anybody made. What is deliberately **not** here is `git branch -D`; deleting a
 * branch goes one at a time through `branch_delete`, with git's own `-d` as the refusal.
 */
fn tool_of(name: &str) -> Option<Tool> {
    match name {
        "lazygit" => Some(Tool {
            program: "lazygit",
            args: &[],
            terminal: true,
        }),
        "agent" => Some(Tool {
            program: "claude",
            args: &[],
            terminal: true,
        }),
        "shell" => Some(Tool {
            program: "",
            args: &[],
            terminal: true,
        }),
        "editor" => Some(Tool {
            program: "codium",
            args: &["."],
            terminal: false,
        }),
        "prune" => Some(Tool {
            program: "git",
            args: &["remote", "prune", "origin"],
            terminal: false,
        }),
        _ => None,
    }
}

/// The names this machine can actually offer, so the window draws no button that would fail.
#[tauri::command]
fn tools() -> Vec<String> {
    let has_terminal = terminal().is_some();
    ["lazygit", "agent", "shell", "editor", "prune"]
        .into_iter()
        .filter(|name| {
            let Some(tool) = tool_of(name) else {
                return false;
            };
            if tool.terminal && !has_terminal {
                return false;
            }
            tool.program.is_empty() || on_path(tool.program)
        })
        .map(str::to_owned)
        .collect()
}

/**
 * Starts a tool in a repository, and does not wait for it.
 *
 * Spawned rather than run to completion: lazygit and an editor outlive the click by hours, and a
 * command that waited would freeze the window for exactly as long as the tool was useful. What
 * comes back is whether it *started* — the only thing that can be known at this point.
 */
#[tauri::command]
fn run_tool(name: String, path: String) -> Option<String> {
    let Some(tool) = tool_of(&name) else {
        return Some(format!("unbekanntes Werkzeug: {name}"));
    };
    if path.trim().is_empty() {
        return Some("kein Pfad angegeben".to_owned());
    }

    let mut command = if tool.terminal {
        let Some(shell) = terminal() else {
            return Some(
                "kein Terminal gefunden — HAFEN_TERMINAL setzen oder eines installieren".to_owned(),
            );
        };
        let mut started = std::process::Command::new(shell);
        if tool.program.is_empty() {
            /*
             * The one tool that *is* the shell: say which, rather than leaving it to the terminal.
             *
             * A terminal picks its own default, and on this machine that came out as bash while
             * the system's own answer is fish. Naming it removes the question — and where there
             * is no answer to name, the terminal's default is still what happens.
             */
            if let Some(own) = user_shell() {
                started.arg("-e").arg(own);
            }
        } else {
            // `-e` is the one flag every terminal here spells the same way.
            started.arg("-e").arg(tool.program).args(tool.args);
        }
        started
    } else {
        let mut started = std::process::Command::new(tool.program);
        started.args(tool.args);
        started
    };

    command
        .current_dir(&path)
        .spawn()
        .err()
        .map(|error| format!("{name}: {error}"))
}

/**
 * Deletes one local branch, with git's own refusal as the safety.
 *
 * `-d` and never `-D`. The lower-case one refuses a branch holding commits that are nowhere else,
 * which means the promise "this loses no work" is kept by the program that knows rather than by a
 * reading of ours that may be a minute old. A `-D` here would be a promise about somebody's work
 * that this window cannot keep.
 *
 * One at a time, and never a sweep: forty branches deleted by one click is forty decisions nobody
 * made.
 */
/// The forges this window will open a page on, and nothing else.
///
/// The same two `packages/core/src/forge.ts` names, and the two have to agree: a host one of them
/// knows and the other does not means the sheet offers a link that the window then refuses. A
/// closed list rather than "any https address", because `open_url` takes a string from the page —
/// and the promise in this file is that a string from the page only ever lands in the one position
/// its caller put it in.
const FORGES: &[&str] = &["github.com", "git.seefahrt.example"];

/// Why this address may not be opened, or nothing.
///
/// Its own function so the checking can be tested without opening anything. Three refusals and
/// each for its own reason: a scheme that is not `https` could be `file:` or worse, whitespace or
/// a control character is how one argument becomes two, and a host nobody named is a stranger.
fn refusal(url: &str) -> Option<String> {
    if !url.starts_with("https://") {
        return Some("nur https".to_owned());
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Some("keine Leerzeichen in einer Adresse".to_owned());
    }
    let rest = &url["https://".len()..];
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    // No userinfo: `https://github.com@evil.example/` has a host nobody would read off it.
    if host.contains('@') || host.is_empty() {
        return Some("kein bekannter Forge-Host".to_owned());
    }
    let named = FORGES
        .iter()
        .any(|forge| host == *forge || host.ends_with(&format!(".{forge}")));
    if named {
        None
    } else {
        Some("kein bekannter Forge-Host".to_owned())
    }
}

/// What opens an address on this platform.
///
/// Shelled out rather than taken from a plugin, which is what this file does for every other
/// hand-off: the capability file says there is no shell permission and no filesystem plugin, and
/// a plugin for one call would be the first exception to that sentence.
fn opener() -> (&'static str, &'static [&'static str]) {
    if cfg!(target_os = "macos") {
        ("open", &[])
    } else if cfg!(windows) {
        // `start` is a shell builtin, so it needs the shell — and the empty string is the window
        // title `start` otherwise takes the url for.
        ("cmd", &["/c", "start", ""])
    } else {
        ("xdg-open", &[])
    }
}

/// Opens a forge page in whatever the machine uses for that. The refusal, or nothing.
#[tauri::command]
fn open_url(url: String) -> Option<String> {
    if let Some(why) = refusal(&url) {
        return Some(why);
    }
    let (program, leading) = opener();
    std::process::Command::new(program)
        .args(leading)
        .arg(&url)
        .spawn()
        .err()
        .map(|error| format!("{program} nicht ausfuehrbar: {error}"))
}

#[tauri::command]
fn branch_delete(path: String, branch: String) -> Option<String> {
    if path.trim().is_empty() || branch.trim().is_empty() {
        return Some("Pfad und Branch werden beide gebraucht".to_owned());
    }

    let output = std::process::Command::new("git")
        .args(["branch", "-d", &branch])
        .current_dir(&path)
        .output();

    match output {
        Err(error) => Some(format!("git nicht ausführbar: {error}")),
        Ok(done) if done.status.success() => None,
        // git says exactly why it refused, and that sentence is the whole answer.
        Ok(done) => Some(String::from_utf8_lossy(&done.stderr).trim().to_owned()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            /*
             * Applied here and not from the frontend, for the reason the rig is derived in Rust
             * and never handed in: a zoom the webview sets itself is one that arrives a frame
             * after the first paint, and it would need an IPC permission for something that is a
             * property of this screen rather than a choice the page makes.
             */
            if let Some(window) = app.get_webview_window("main") {
                let factor = zoom();
                if let Err(error) = window.set_zoom(factor) {
                    eprintln!("hafen: Zoom {factor:.2}x nicht gesetzt: {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            measure,
            measure_progress,
            measure_cancel,
            forge,
            store,
            register,
            tools,
            run_tool,
            branch_delete,
            open_url,
            // The window's own way to the outside world, so it needs no second program to
            // measure. See `ports.rs` — the allow list of readings is enforced there.
            ports::port_run,
            ports::port_which,
            ports::port_read_file,
            ports::port_read_dir,
            ports::port_is_directory,
            ports::port_real_path,
            ports::port_trees_with,
            ports::port_write_file,
            ports::port_host,
            ports::port_places
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hafen");
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, MutexGuard};

    use super::*;

    /// The command the window has been calling since the forge panel grew its links — and which
    /// did not exist, so every one of them answered "Command open_url not found".
    #[test]
    fn opens_a_page_on_a_forge_we_know() {
        assert_eq!(refusal("https://github.com/ulfgebhardt/hafen"), None);
        assert_eq!(refusal("https://git.seefahrt.example/Wattenmeer/spec/issues"), None);
    }

    /// A closed list, because `open_url` takes a string from the page. Any https address would be
    /// a different promise than the one this file makes.
    #[test]
    fn refuses_a_host_nobody_named() {
        assert!(refusal("https://example.org/x").is_some());
        // Userinfo is how an address reads as one host and resolves to another.
        assert!(refusal("https://github.com@evil.example/").is_some());
    }

    /// `file:` and `javascript:` are the reason the scheme is checked rather than assumed.
    #[test]
    fn refuses_anything_that_is_not_https() {
        assert!(refusal("file:///etc/passwd").is_some());
        assert!(refusal("http://github.com/x").is_some());
        assert!(refusal("javascript:alert(1)").is_some());
    }

    /// Whitespace is how one argument becomes two.
    #[test]
    fn refuses_an_address_with_room_for_a_second_argument() {
        assert!(refusal("https://github.com/x --flag").is_some());
        assert!(refusal("https://github.com/x\nrm -rf /").is_some());
    }

    /// A subdomain of a named forge is that forge; a host merely ending in the same letters is not.
    #[test]
    fn tells_a_subdomain_from_a_lookalike() {
        assert_eq!(refusal("https://raw.github.com/x"), None);
        assert!(refusal("https://notgithub.com/x").is_some());
    }

    /// One lock for every test that touches the environment.
    ///
    /// `std::env` is process-wide and cargo runs tests on several threads, so two of these
    /// setting `GDK_SCALE` at once read each other's value — measured here as one failure in a
    /// run that passed a minute earlier. Serialising the guard fixes the cause; `--test-threads=1`
    /// would only hide it, and for the whole suite rather than the four tests that need it.
    static ENV: Mutex<()> = Mutex::new(());

    /// A guard that puts the environment back, so these tests can run in any order.
    struct Env {
        keys: Vec<(&'static str, Option<String>)>,
        /// Held for the lifetime of the guard; released when the test ends.
        _lock: MutexGuard<'static, ()>,
    }

    impl Env {
        fn set(pairs: &[(&'static str, Option<&str>)]) -> Self {
            // A poisoned lock means another env test panicked. Its guard still restored the
            // variables on unwind, so the environment is usable and this one may proceed.
            let lock = ENV.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let keys = pairs
                .iter()
                .map(|(key, value)| {
                    let previous = std::env::var(key).ok();
                    match value {
                        Some(value) => std::env::set_var(key, value),
                        None => std::env::remove_var(key),
                    }
                    (*key, previous)
                })
                .collect();
            Self { keys, _lock: lock }
        }
    }

    impl Drop for Env {
        fn drop(&mut self) {
            for (key, previous) in &self.keys {
                match previous {
                    Some(value) => std::env::set_var(key, value),
                    None => std::env::remove_var(key),
                }
            }
        }
    }

    #[test]
    fn the_override_wins_over_the_cache() {
        let _env = Env::set(&[
            ("HAFEN_SNAPSHOT", Some("/anderswo/snapshot.json")),
            ("XDG_CACHE_HOME", Some("/cache")),
        ]);

        assert_eq!(
            snapshot_path(),
            Some(PathBuf::from("/anderswo/snapshot.json"))
        );
    }

    /// An empty variable is not an answer: it is how a shell spells "unset" by accident.
    #[test]
    fn an_empty_override_is_no_override() {
        let _env = Env::set(&[
            ("HAFEN_SNAPSHOT", Some("")),
            ("XDG_CACHE_HOME", Some("/cache")),
        ]);

        assert_eq!(
            snapshot_path(),
            Some(PathBuf::from("/cache/hafen/snapshot.json"))
        );
    }

    #[test]
    fn falls_back_to_the_home_cache() {
        let _env = Env::set(&[
            ("HAFEN_SNAPSHOT", None),
            ("XDG_CACHE_HOME", None),
            ("HOME", Some("/home/someone")),
        ]);

        assert_eq!(
            snapshot_path(),
            Some(PathBuf::from("/home/someone/.cache/hafen/snapshot.json"))
        );
    }

    /// The path is in the answer even when there is nothing to read — that is the whole point of
    /// carrying it: the one useful thing to say about a missing snapshot is where it was sought.
    #[test]
    fn a_missing_snapshot_still_says_where_it_looked() {
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some("/gibt/es/nicht/snapshot.json"))]);

        let answer = snapshot(None);

        assert_eq!(answer.path, "/gibt/es/nicht/snapshot.json");
        assert!(answer.json.is_none());
        assert!(answer.error.is_some());
    }

    /// The machine this was written for: X reports 96 dpi for a panel that is 210.
    #[test]
    fn works_the_size_out_from_a_dense_screen() {
        let xrandr = "eDP-1 connected primary 2560x1440+0+0 (normal left inverted right x axis \
                      y axis) 309mm x 174mm";

        let dpi = parse_dpi(xrandr).expect("dpi");
        assert!((dpi - 210.4).abs() < 0.5, "dpi was {dpi}");

        let env = |_: &str| None;
        assert!((zoom_from(&env, Some(dpi)) - 2.25).abs() < 1e-9);
    }

    /// An ordinary screen is left alone — a factor of 1 is not something to "correct".
    #[test]
    fn an_ordinary_screen_draws_at_its_own_size() {
        let env = |_: &str| None;
        assert!((zoom_from(&env, Some(96.0)) - 1.0).abs() < 1e-9);
        assert!((zoom_from(&env, None) - 1.0).abs() < 1e-9);
    }

    /// Somebody who configured their desktop has already answered the question.
    #[test]
    fn takes_the_desktop_scaling_that_is_already_set() {
        let scaled = |name: &str| (name == "GDK_SCALE").then(|| "2".to_owned());
        assert!((zoom_from(&scaled, Some(210.0)) - 2.0).abs() < 1e-9);

        let text = |name: &str| (name == "GDK_DPI_SCALE").then(|| "1.5".to_owned());
        assert!((zoom_from(&text, None) - 1.5).abs() < 1e-9);
    }

    #[test]
    fn an_explicit_setting_beats_both() {
        let env = |name: &str| match name {
            "HAFEN_ZOOM" => Some("1.75".to_owned()),
            "GDK_SCALE" => Some("2".to_owned()),
            _ => None,
        };

        assert!((zoom_from(&env, Some(210.0)) - 1.75).abs() < 1e-9);
    }

    /// Past three it is a magnifier, not a readable window — whoever asked, and however.
    #[test]
    fn never_past_the_cap() {
        let huge = |name: &str| (name == "HAFEN_ZOOM").then(|| "9".to_owned());
        assert!((zoom_from(&huge, None) - MAX_ZOOM).abs() < 1e-9);
        assert!((zoom_from(&|_| None, Some(2000.0)) - MAX_ZOOM).abs() < 1e-9);
    }

    /// Junk is not a setting: a `GDK_SCALE=auto` must not read as zero and blank the window.
    #[test]
    fn unreadable_or_zero_values_are_no_setting() {
        let junk = |name: &str| match name {
            "GDK_SCALE" => Some("auto".to_owned()),
            "GDK_DPI_SCALE" => Some("0".to_owned()),
            _ => None,
        };

        assert!((zoom_from(&junk, Some(210.0)) - 2.25).abs() < 1e-9);
    }

    #[test]
    fn a_screen_without_measurements_says_nothing() {
        assert!(parse_dpi("eDP-1 connected primary 2560x1440+0+0 0mm x 0mm").is_none());
        assert!(parse_dpi("eDP-1 disconnected").is_none());
        assert!(parse_dpi("").is_none());
    }

    /// The development checkout points at a runner with its own arguments; an installed one is a
    /// single word. Both have to work, which is why this splits rather than taking the string.
    #[test]
    fn takes_a_runner_with_arguments() {
        let _env = Env::set(&[(
            "HAFEN_CLI",
            Some("pnpm --filter @hafen/cli exec tsx src/index.ts"),
        )]);

        assert_eq!(
            cli(),
            vec![
                "pnpm",
                "--filter",
                "@hafen/cli",
                "exec",
                "tsx",
                "src/index.ts"
            ]
        );
    }

    /// An empty variable is how a shell spells "unset" by accident — the same rule the snapshot
    /// path follows, and for the same reason.
    #[test]
    fn falls_back_to_the_installed_command() {
        // Two guards, two scopes. `ENV` is not reentrant, so a second `Env::set` while the first
        // is still alive is a deadlock — and it does not fail, it hangs: the whole run sat there
        // with seven tests "running for over 60 seconds" and said nothing about why.
        {
            let _env = Env::set(&[("HAFEN_CLI", None)]);
            assert_eq!(cli(), vec!["hafen"]);
        }
        let _empty = Env::set(&[("HAFEN_CLI", Some("   "))]);
        assert_eq!(cli(), vec!["hafen"]);
    }

    /// A word it does not know is a refusal, never an argument handed to a process.
    #[test]
    fn refuses_a_register_action_it_does_not_know() {
        assert!(register("verschrotten".to_owned(), "/x".to_owned())
            .is_some_and(|said| said.contains("verschrotten")));
        assert!(register("archivieren".to_owned(), "  ".to_owned()).is_some());
    }

    /// What it printed, and not the exit code: a number sends a person reading a manual.
    #[test]
    fn says_what_the_cli_said_when_it_failed() {
        let _env = Env::set(&[("HAFEN_CLI", Some("sh -c"))]);

        // `sh -c 'echo … >&2; exit 1' schnappschuss` — the extra word lands in $0 and is ignored.
        let failed = run_cli(&["echo nicht lesbar >&2; exit 1".to_owned()]);

        assert_eq!(failed.unwrap_err(), "nicht lesbar");
    }

    #[test]
    fn says_when_there_is_nothing_to_run() {
        let _env = Env::set(&[("HAFEN_CLI", Some("gibt-es-hier-nicht"))]);

        // `run_watched` and not `measure`: the command is async now, so that it no longer runs
        // on the main thread and freezes the window. What can fail is here.
        assert!(run_watched(&["schnappschuss".to_owned()])
            .unwrap_err()
            .contains("nicht ausführbar"));
    }

    /// Through a temporary file and a rename, so a reader sees the old snapshot or the new one.
    #[test]
    fn writes_the_snapshot_whole_or_not_at_all() {
        let file = std::env::temp_dir().join("hafen-test-store.json");
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some(file.to_str().expect("utf-8")))]);

        assert!(store(r#"{"ships":[]}"#.to_owned(), None).is_none());
        assert_eq!(
            std::fs::read_to_string(&file).expect("read"),
            r#"{"ships":[]}"#
        );
        assert!(!file.with_extension("json.neu").exists());
        std::fs::remove_file(&file).ok();
    }

    /// A name it does not know is a refusal, never a program handed to the machine.
    #[test]
    fn refuses_a_tool_it_does_not_know() {
        assert!(tool_of("rm").is_none());
        assert!(
            run_tool("rm".to_owned(), "/tmp".to_owned()).is_some_and(|said| said.contains("rm"))
        );
        assert!(run_tool("lazygit".to_owned(), "  ".to_owned()).is_some());
    }

    /// `-d` and never `-D`: the refusal belongs to git, which knows what is only on this branch.
    #[test]
    fn deletes_a_branch_only_the_way_git_allows() {
        assert!(branch_delete(String::new(), "feat".to_owned()).is_some());
        assert!(branch_delete("/tmp".to_owned(), String::new()).is_some());

        // Nothing in the whole file may reach for the destructive one.
        assert!(!include_str!("lib.rs").contains("\"-D\""));
    }

    /// A progress line is folded into what is known, and a broken one is ignored.
    ///
    /// Parsed by hand because there are two shapes of one tiny object — and because a malformed
    /// line is a line to skip, not a reason to lose the survey that is still running.
    #[test]
    fn reads_what_the_survey_reports() {
        // Under the same lock as the environment tests: `PROGRESS` is one global, and two tests
        // writing it at once would fail each other rather than the code.
        let _env = Env::set(&[]);
        note("{\"of\":94}");
        note("{\"at\":7,\"path\":\"/repos/org/ship\"}");
        let seen = measure_progress();

        assert_eq!(seen.of, 94);
        assert_eq!(seen.at, 7);
        assert_eq!(seen.path, "/repos/org/ship");
    }

    #[test]
    fn ignores_a_line_that_is_not_progress() {
        let _env = Env::set(&[]);
        note("{\"at\":0,\"path\":\"\"}");
        note("{\"of\":94}");
        note("! keine lesbare Quest: /store/quests/kaputt.md");
        let seen = measure_progress();

        assert_eq!(seen.of, 94);
        assert_eq!(seen.path, "");
    }

    #[test]
    fn reads_the_number_after_a_key_and_nothing_else() {
        assert_eq!(
            field("{\"at\":12,\"path\":\"/x\"}", "\"at\":").as_deref(),
            Some("12")
        );
        assert_eq!(field("{\"at\":}", "\"at\":"), None);
        assert_eq!(field("{}", "\"at\":"), None);
    }

    /// Nothing to stop is not a failure: the button is there while the bar is, and a click that
    /// arrives a moment after the survey finished has simply nothing to do.
    #[test]
    fn stopping_nothing_is_no_error() {
        let _env = Env::set(&[]);
        if let Ok(mut progress) = PROGRESS.lock() {
            progress.running = false;
        }

        assert!(measure_cancel().is_none());
    }

    /// The system's own answer, not the variable the window happened to inherit.
    #[test]
    fn opens_the_shell_the_system_records() {
        let passwd = concat!(
            "root:x:0:0:root:/root:/bin/bash\n",
            "seefahrt:x:1000:1000::/home/seefahrt:/usr/bin/fish\n"
        );

        assert_eq!(
            shell_in_passwd(passwd, "seefahrt").as_deref(),
            Some("/usr/bin/fish")
        );
        assert_eq!(shell_in_passwd(passwd, "niemand"), None);
    }

    #[test]
    fn takes_a_line_without_a_shell_as_no_answer() {
        assert_eq!(shell_in_passwd("x:x:0:0::/home/x:\n", "x"), None);
        assert_eq!(shell_in_passwd("", "x"), None);
    }

    /// `git` is `git.exe` on Windows, and `PATH` says nothing about that.
    #[test]
    fn knows_what_a_command_is_called_on_disk() {
        assert_eq!(executables("git", false, None), vec!["git".to_owned()]);
        assert_eq!(
            executables("git", true, Some(".COM;.EXE;.BAT".to_owned())),
            vec![
                "git".to_owned(),
                "git.com".to_owned(),
                "git.exe".to_owned(),
                "git.bat".to_owned(),
            ]
        );
        // Without the variable the usual four are assumed rather than nothing being found.
        assert!(executables("git", true, None).contains(&"git.exe".to_owned()));
    }

    /// Only what this machine can actually run — a button that fails in the click is worse than
    /// no button, which is the same rule the measure button follows.
    #[test]
    fn offers_only_tools_that_exist() {
        let offered = tools();

        assert!(offered.iter().all(|name| tool_of(name).is_some()));
        // `git` is on any machine that has a repository to look at.
        assert!(offered.contains(&"prune".to_owned()));
    }

    #[test]
    fn finds_a_terminal_that_was_named() {
        let _env = Env::set(&[("HAFEN_TERMINAL", Some("meinterminal"))]);
        assert_eq!(terminal().as_deref(), Some("meinterminal"));
    }

    /**
     * `$HAFEN_SNAPSHOT` names a *file*, and the forge reading is placed beside it.
     *
     * Rebuilding the snapshot's name from its cache key threw the override's own filename away —
     * exactly what a second fleet pointed somewhere by name relies on.
     */
    #[test]
    fn keeps_the_override_and_puts_the_other_beside_it() {
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some("/anderswo/flotte-zwei.json"))]);

        assert_eq!(
            cache_path("snapshot"),
            Some(PathBuf::from("/anderswo/flotte-zwei.json"))
        );
        assert_eq!(
            cache_path("forge"),
            Some(PathBuf::from("/anderswo/forge.json"))
        );
    }

    /// A name it does not know is a refusal, not a file somewhere unexpected.
    #[test]
    fn refuses_a_cache_it_does_not_know() {
        let answer = snapshot(Some("../../etc/passwd".to_owned()));

        assert!(answer.json.is_none());
        assert!(answer
            .error
            .is_some_and(|said| said.contains("unbekannter Cache")));
        assert!(store("{}".to_owned(), Some("woanders".to_owned())).is_some());
    }

    #[test]
    fn reads_a_snapshot_that_is_there() {
        let file = std::env::temp_dir().join("hafen-test-snapshot.json");
        std::fs::write(
            &file,
            r#"{"at":"2026-09-30T00:00:00Z","root":"/repos","ships":[]}"#,
        )
        .expect("write");
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some(file.to_str().expect("utf-8")))]);

        let answer = snapshot(None);

        assert!(answer.error.is_none());
        assert!(answer.json.expect("json").contains("\"ships\""));
        std::fs::remove_file(&file).ok();
    }
}
