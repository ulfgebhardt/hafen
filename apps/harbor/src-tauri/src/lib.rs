//! The window's shell.
//!
//! One command, and it reads one file. The harbour measures nothing at runtime: `hafen
//! schnappschuss` walks the repositories and writes the snapshot, this reads it and the webview
//! draws it. That split is the whole reason there is no shell permission in
//! `capabilities/default.json` — a window that could run `git` would be a window that measures,
//! and then "gemessen 29.9., 23:42" in the header would be a claim nobody checks.
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
    let resolution = line.split_whitespace().find(|word| word.contains('x') && word.contains('+'))?;
    let pixels: f64 = resolution.split('x').next()?.parse().ok()?;
    let millimetres: f64 = line
        .split_whitespace()
        .zip(line.split_whitespace().skip(1))
        .find_map(|(value, unit)| (unit == "x").then(|| value.trim_end_matches("mm").parse().ok())?)?;

    (pixels > 0.0 && millimetres > 0.0).then(|| pixels / (millimetres / 25.4))
}

fn display_dpi() -> Option<f64> {
    let output = std::process::Command::new("xrandr").arg("--query").output().ok()?;
    output.status.success().then(|| parse_dpi(&String::from_utf8_lossy(&output.stdout)))?
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
    let read = |name: &str| env(name)?.trim().parse::<f64>().ok().filter(|value| *value > 0.0);

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
        .or_else(|| std::env::var("HOME").ok().map(|home| PathBuf::from(home).join(".cache")))?;

    Some(cache.join("hafen").join("snapshot.json"))
}

#[tauri::command]
fn snapshot() -> Snapshot {
    let Some(path) = snapshot_path() else {
        return Snapshot {
            path: "(unbekannt)".to_owned(),
            json: None,
            error: Some("weder HAFEN_SNAPSHOT noch XDG_CACHE_HOME noch HOME sind gesetzt".to_owned()),
        };
    };

    let shown = path.display().to_string();
    match std::fs::read_to_string(&path) {
        Ok(json) => Snapshot { path: shown, json: Some(json), error: None },
        Err(error) => Snapshot { path: shown, json: None, error: Some(error.to_string()) },
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
        .invoke_handler(tauri::generate_handler![snapshot])
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

        assert_eq!(snapshot_path(), Some(PathBuf::from("/anderswo/snapshot.json")));
    }

    /// An empty variable is not an answer: it is how a shell spells "unset" by accident.
    #[test]
    fn an_empty_override_is_no_override() {
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some("")), ("XDG_CACHE_HOME", Some("/cache"))]);

        assert_eq!(snapshot_path(), Some(PathBuf::from("/cache/hafen/snapshot.json")));
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

    #[test]
    fn reads_a_snapshot_that_is_there() {
        let file = std::env::temp_dir().join("hafen-test-snapshot.json");
        std::fs::write(&file, r#"{"at":"2026-09-30T00:00:00Z","root":"/repos","ships":[]}"#)
            .expect("write");
        let _env = Env::set(&[("HAFEN_SNAPSHOT", Some(file.to_str().expect("utf-8")))]);

        let answer = snapshot();

        assert!(answer.error.is_none());
        assert!(answer.json.expect("json").contains("\"ships\""));
        std::fs::remove_file(&file).ok();
    }
}
