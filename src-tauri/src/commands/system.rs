use crate::models::AppStats;
use crate::state::AppMonitorState;

#[tauri::command]
pub fn get_app_stats(state: tauri::State<AppMonitorState>) -> AppStats {
    let mut sys = state.system.lock().unwrap();
    sys.refresh_cpu();
    sys.refresh_memory();
    sys.refresh_processes();

    let pid = sysinfo::get_current_pid().ok();
    let mut cpu = 0.0;
    let mut mem = 0;

    if let Some(pid) = pid {
        if let Some(process) = sys.process(pid) {
            cpu = process.cpu_usage();
            mem = process.memory();
        }
    }

    let mut gpu_usage = 0.0;
    if let Ok(nvml) = state.nvml.lock() {
        if let Some(nvml) = nvml.as_ref() {
            if let Ok(device) = nvml.device_by_index(0) {
                if let Ok(util) = device.utilization_rates() {
                    gpu_usage = util.gpu as f32;
                }
            }
        }
    }

    AppStats {
        cpu_usage: cpu,
        memory_usage: mem,
        total_memory: sys.total_memory(),
        gpu_usage,
    }
}
