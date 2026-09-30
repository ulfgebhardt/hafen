//! The window's shell.
//!
//! Four commands, and every one of them is *named*. There is still no shell permission and no
//! filesystem plugin: the webview cannot run a command of its own choosing, cannot name a file to
//! write, and cannot pass an argument this file did not decide the shape of. What it can do is ask
//! for one of four things by name.
//!
//! The promise that changed, and the one that did not. It used to read: the window runs nothing at
//! all. That was too strong for what it was protecting — a harbour whose only way to refresh was a
//! terminal is a harbour that shows yesterday. What it protects is this: **the harbour changes no
//! repository.** Measuring is reading `git`, and the read-only command list is held by a test on
//! the TypeScript side. Writing happens to exactly one file, the register, and what stands in it
//! is a decision a person made — never something measured.
//!
//! Neither measuring nor the register's format lives here. `hafen schnappschuss` walks the
//! repositories, `hafen register` edits the register, and this runs them. A Rust half that knew
//! the register's format would be a second opinion about a file both of them edit.
//!
//! Read at runtime rather than bundled with the frontend, which is the difference between a
//! desktop app and a screenshot: a snapshot baked in at build time is as old as the build, and
//! nothing on screen would say so.

use std::path::PathBuf;

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

#[tauri::command]
fn snapshot() -> Snapshot {
    let Some(path) = snapshot_path() else {
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
#[tauri::command]
fn measure(only: Option<String>) -> Measured {
    let mut args = vec!["schnappschuss".to_owned()];
    if let Some(path) = only.filter(|path| !path.trim().is_empty()) {
        args.push(format!("--nur={path}"));
    }
    Measured::of(run_cli(&args))
}

/// Writes the snapshot to the one path it can ever be written to.
///
/// The path is not an argument and cannot be: the page says *what*, never *where*. Through a
/// temporary file and a rename, so a window reading the cache while this runs sees either the old
/// snapshot or the new one and never half of one.
#[tauri::command]
fn store(json: String) -> Option<String> {
    let path = snapshot_path()?;
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
        .invoke_handler(tauri::generate_handler![snapshot, measure, store, register])
        .run(tauri::generate_context!())
        .expect("error while running Hafen");
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, MutexGuard};

    use super::*;

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

        let answer = snapshot();

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

        assert!(measure(None)
            .error
            .is_some_and(|said| said.contains("nicht ausführbar")));
    }

    /// Through a temporary file and a rename, so a reader sees the old snapshot or the new one.
    #[test]
    fn writes_the_snapshot_whole_or_not_at_all() {
        let file = std::env::temp_dir().join("hafen-test-store.json");
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some(file.to_str().expect("utf-8")))]);

        assert!(store(r#"{"ships":[]}"#.to_owned()).is_none());
        assert_eq!(
            std::fs::read_to_string(&file).expect("read"),
            r#"{"ships":[]}"#
        );
        assert!(!file.with_extension("json.neu").exists());
        std::fs::remove_file(&file).ok();
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

        let answer = snapshot();

        assert!(answer.error.is_none());
        assert!(answer.json.expect("json").contains("\"ships\""));
        std::fs::remove_file(&file).ok();
    }
}
