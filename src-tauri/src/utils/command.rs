use std::process::Command as StdCommand;
use tokio::process::Command as TokioCommand;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// CREATE_NO_WINDOW (0x08000000) prevents console window creation on Windows
#[cfg(target_os = "windows")]
const WINDOWS_NO_WINDOW_FLAGS: u32 = 0x08000000;

#[allow(dead_code)]
pub trait CommandExtWrapper {
    /// Add creation flags on Windows to suppress console window flashing
    fn creation_flags_windows(&mut self) -> &mut Self;
}

#[allow(dead_code)]
impl CommandExtWrapper for StdCommand {
    fn creation_flags_windows(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        self.creation_flags(WINDOWS_NO_WINDOW_FLAGS);

        self
    }
}

#[allow(dead_code)]
impl CommandExtWrapper for TokioCommand {
    fn creation_flags_windows(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        self.creation_flags(WINDOWS_NO_WINDOW_FLAGS);

        self
    }
}
