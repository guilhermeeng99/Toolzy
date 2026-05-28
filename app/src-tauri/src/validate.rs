//! Pure input-validation guards for the audio/video/PDF editing commands. Each
//! returns the exact user-facing `Err` string its command surfaces, kept here (not
//! inline in the `async` commands) so the numbered business rules in `docs/specs`
//! are unit-tested at their boundaries without spawning a sidecar.

/// Trim range must be non-negative with `start` strictly before `end` (audio/video
/// trim). Rejects `start == end` so the cut is never zero-length.
pub fn valid_trim_range(start: f64, end: f64) -> Result<(), String> {
    if start >= 0.0 && start < end {
        Ok(())
    } else {
        Err("invalid trim range".into())
    }
}

/// Volume percent caps at 400 (0 = mute, 100 = unchanged); above that → `Err`.
pub fn valid_volume(percent: u32) -> Result<(), String> {
    if percent <= 400 {
        Ok(())
    } else {
        Err("volume out of range".into())
    }
}

/// Playback speed is limited to ffmpeg's safe 0.5–2.0 (one `atempo` step).
pub fn valid_speed(factor: f64) -> Result<(), String> {
    if (0.5..=2.0).contains(&factor) {
        Ok(())
    } else {
        Err("speed out of range".into())
    }
}

/// A non-empty password is required to add/remove PDF protection.
pub fn require_password(password: &str) -> Result<(), String> {
    if password.is_empty() {
        Err("password required".into())
    } else {
        Ok(())
    }
}

/// Concatenation needs at least two clips.
pub fn require_two_videos(count: usize) -> Result<(), String> {
    if count >= 2 {
        Ok(())
    } else {
        Err("need at least two videos".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_range_requires_start_before_end_and_nonnegative() {
        assert!(valid_trim_range(0.0, 5.0).is_ok());
        assert!(valid_trim_range(1.5, 10.0).is_ok());
        assert!(valid_trim_range(2.0, 2.0).is_err()); // zero-length
        assert!(valid_trim_range(5.0, 2.0).is_err()); // reversed
        assert!(valid_trim_range(-1.0, 5.0).is_err()); // negative start
    }

    #[test]
    fn volume_caps_at_400() {
        assert!(valid_volume(0).is_ok());
        assert!(valid_volume(100).is_ok());
        assert!(valid_volume(400).is_ok());
        assert!(valid_volume(401).is_err());
    }

    #[test]
    fn speed_bounded_to_half_through_two() {
        assert!(valid_speed(0.5).is_ok());
        assert!(valid_speed(1.0).is_ok());
        assert!(valid_speed(2.0).is_ok());
        assert!(valid_speed(0.49).is_err());
        assert!(valid_speed(2.01).is_err());
    }

    #[test]
    fn password_must_be_nonempty() {
        assert!(require_password("hunter2").is_ok());
        assert!(require_password("").is_err());
    }

    #[test]
    fn two_videos_minimum_for_merge() {
        assert!(require_two_videos(0).is_err());
        assert!(require_two_videos(1).is_err());
        assert!(require_two_videos(2).is_ok());
        assert!(require_two_videos(3).is_ok());
    }
}
