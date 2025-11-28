use nvml_wrapper::Nvml;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use sysinfo::System;

pub type VideoRegistry = Arc<Mutex<HashMap<String, PathBuf>>>;

pub struct AppMonitorState {
    pub system: Mutex<System>,
    pub nvml: Mutex<Option<Nvml>>,
}
