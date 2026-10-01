//! The window's own way to the outside world, so it needs no second program to measure.
//!
//! `packages/core` touches nothing directly: it asks a `Ports` for everything, which is what made
//! the same survey run in the CLI, in the window and in a test. Until now the window used that by
//! *starting the CLI* — which meant a downloaded binary measured nothing at all, because no
//! stranger has `hafen` on their PATH. These commands are the window's own implementation of that
//! interface, and with them the app is the whole tool.
//!
//! **The allow list moved here, and that is the point.** It lived in `command.spec.ts`, where it
//! was a *test*: a promise checked at build time about code that could still do anything at
//! runtime. Here it is the gate every call goes through. The window may run `git` and only with
//! the arguments below; anything else is refused with the call written out, so a refusal says
//! what was attempted rather than that something was.
//!
//! A deny list would be the weaker direction, and `CLAUDE.md` says why: with a gap it lets a
//! write through silently, while an allow list at worst trips over a new *reading*. `git worktree
//! list` is the proof — checking for the word `worktree` called a read a write.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

/// Every git invocation the survey makes, as the prefix it begins with.
///
/// Copied from the list `command.spec.ts` has asserted against since the beginning, because the
/// two have to agree: that test now checks a guarantee this file keeps rather than an intention
/// the CLI had. A new reading has to be added in both places, which is the friction an allow list
/// is for.
const READING: &[&str] = &[
    "remote -v",
    "rev-parse",
    "status --porcelain",
    "log -1",
    "worktree list --porcelain",
    "rev-list --count",
    "ls-files -z",
    "ls-files",
    "stash list",
    "log --format=",
    "config --get user.email",
    "for-each-ref --format=",
    "branch --merged",
    "symbolic-ref --short refs/remotes/origin/HEAD",
    "grep -I -c",
    "submodule status",
    "rev-list --max-parents=0",
    "config -f .gitmodules --get-regexp",
];

/// Whether a call is one of the readings, by the first words of it.
///
/// Joined and compared as a prefix rather than matched argument by argument: a reading like
/// `log --format=<a format with spaces in it>` is one prefix and an unknown number of words, and
/// a per-argument rule would have to know which of them may vary.
pub fn reading(command: &str, args: &[String]) -> bool {
    if command != "git" {
        return false;
    }
    let line = args.join(" ");
    READING.iter().any(|allowed| line.starts_with(allowed))
}

/// What a command did, in the shape `CommandResult` has in `ports.ts`.
#[derive(Serialize)]
pub struct Ran {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// Runs one reading. **Never throws on a non-zero exit code** — that is reported in `code`.
///
/// The contract is `ProcPort.run`'s: a repository without a HEAD, without an upstream or without
/// a `.gitmodules` answers with a code and an empty stdout, and the survey reads that as "no
/// answer" rather than as a failure. Turning those into errors would make a quarter of this fleet
/// unmeasurable.
#[tauri::command]
pub fn port_run(command: String, args: Vec<String>, cwd: Option<String>) -> Result<Ran, String> {
    if !reading(&command, &args) {
        // Written out, because a refusal nobody can read is a bug report nobody can file.
        return Err(format!("nicht erlaubt: {command} {}", args.join(" ")));
    }
    let mut call = Command::new(&command);
    call.args(&args);
    if let Some(dir) = cwd.as_deref() {
        call.current_dir(dir);
    }
    match call.output() {
        Ok(out) => Ok(Ran {
            code: out.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        }),
        // A missing program is a measurement too: `which` is what asks, and the survey treats a
        // failed run as "no answer", which is what a machine without git honestly has.
        Err(error) => Ok(Ran {
            code: -1,
            stdout: String::new(),
            stderr: error.to_string(),
        }),
    }
}

/// Where a program lies on the PATH, or nothing.
///
/// The platform is read here and not handed in: which names an executable may carry is a fact
/// about *this* machine, and a webview that could claim to be Windows would be a webview deciding
/// which files count as programs.
#[tauri::command]
pub fn port_which(command: String) -> Option<String> {
    let paths = std::env::var("PATH").ok()?;
    let names = crate::executables(&command, cfg!(windows), std::env::var("PATHEXT").ok());
    std::env::split_paths(&paths)
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|at| at.is_file())
        .map(|at| at.to_string_lossy().into_owned())
}

/// A file's contents, or nothing where it does not exist. **Never throws on absence.**
#[tauri::command]
pub fn port_read_file(path: String) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

/// The names in a directory, or nothing where it does not exist.
#[tauri::command]
pub fn port_read_dir(path: String) -> Option<Vec<String>> {
    let mut names: Vec<String> = std::fs::read_dir(path)
        .ok()?
        .filter_map(|entry| Some(entry.ok()?.file_name().to_string_lossy().into_owned()))
        .collect();
    // Sorted, because a survey that depends on the order a filesystem hands its entries back is a
    // survey that reads differently on two machines holding the same repositories.
    names.sort();
    Some(names)
}

#[tauri::command]
pub fn port_is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

/// The path with every symbolic link resolved, or nothing where it cannot be.
///
/// Needed because a link is invisible to every other call here: `is_directory` follows one without
/// saying so, so a repository reachable through six links is six repositories.
#[tauri::command]
pub fn port_real_path(path: String) -> Option<String> {
    std::fs::canonicalize(path)
        .ok()
        .map(|at| at.to_string_lossy().into_owned())
}

/// Writes a file, creating the directories above it. The reason it failed, or nothing on success.
///
/// The one writing call, and it is not a hole in "der Hafen verändert kein Repository": what goes
/// through it is the register and the cache. Nothing measured is ever written, and the paths are
/// the store's and the cache's — not a repository's.
#[tauri::command]
pub fn port_write_file(path: String, contents: String) -> Option<String> {
    if let Some(above) = Path::new(&path).parent() {
        if let Err(error) = std::fs::create_dir_all(above) {
            return Some(error.to_string());
        }
    }
    std::fs::write(&path, contents).err().map(|e| e.to_string())
}

/// What the machine has, for the readings that are about the host rather than a repository.
#[derive(Serialize)]
pub struct Machine {
    pub cpus: usize,
    pub memory: u64,
}

#[tauri::command]
pub fn port_host() -> Machine {
    Machine {
        cpus: std::thread::available_parallelism()
            .map(std::num::NonZeroUsize::get)
            .unwrap_or(1),
        // Read once at startup rather than carried as a dependency: the one caller is the yard's
        // capacity, which is a rough reading about this machine and not an inventory of it.
        memory: total_memory(),
    }
}

/// Total memory in bytes, or nought where this platform does not say.
///
/// `/proc/meminfo` on Linux and nothing elsewhere, deliberately: a crate for one number that one
/// panel shows would be a dependency bigger than the reading. Nought means "not measured", and
/// the panel says that rather than inventing a figure.
fn total_memory() -> u64 {
    let Ok(info) = std::fs::read_to_string("/proc/meminfo") else {
        return 0;
    };
    info.lines()
        .find(|line| line.starts_with("MemTotal:"))
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|kb| kb.parse::<u64>().ok())
        .map(|kb| kb * 1024)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The whole reason this file exists: the window may read, and only the readings named.
    #[test]
    fn allows_every_reading_the_survey_makes() {
        for allowed in READING {
            let args: Vec<String> = allowed.split(' ').map(str::to_owned).collect();
            assert!(reading("git", &args), "{allowed} sollte erlaubt sein");
        }
    }

    #[test]
    fn refuses_anything_that_writes() {
        for call in [
            vec!["push"],
            vec!["commit", "-m", "x"],
            vec!["reset", "--hard"],
            vec!["checkout", "main"],
            vec!["branch", "-D", "x"],
            vec!["clean", "-fd"],
        ] {
            let args: Vec<String> = call.iter().map(|one| (*one).to_owned()).collect();
            assert!(!reading("git", &args), "{call:?} darf nicht erlaubt sein");
        }
    }

    /// Only git. A reading is a reading of *this* program; another one is another question.
    #[test]
    fn refuses_another_program_entirely() {
        let args = vec!["status".to_owned(), "--porcelain".to_owned()];

        assert!(!reading("sh", &args));
        assert!(!reading("rm", &args));
    }

    /// `branch --merged` is a reading and `branch -D` is not, and they begin with the same word.
    #[test]
    fn tells_two_calls_of_one_subcommand_apart() {
        assert!(reading("git", &["branch".to_owned(), "--merged".to_owned()]));
        assert!(!reading("git", &["branch".to_owned(), "-d".to_owned()]));
    }
}
