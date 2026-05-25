use std::fs;
use std::path::Path;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::State;
use rfd::FileDialog;

#[derive(serde::Serialize, Clone)]
struct FileNode {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    children: Vec<FileNode>,
}

#[derive(serde::Serialize, Clone)]
struct Backlink {
    name: String,
    path: String,
}

#[derive(serde::Serialize, Clone)]
struct GraphNode {
    id: String,
    path: Option<String>,
    exists: bool,
}

#[derive(serde::Serialize, Clone)]
struct GraphEdge {
    source: String,
    target: String,
}

#[derive(serde::Serialize, Clone)]
struct GraphData {
    nodes: Vec<GraphNode>,
    links: Vec<GraphEdge>,
}

// Estructura de Datos en Memoria para Enlaces Bidireccionales
struct VaultIndex {
    // file_path -> Set de nombres de notas (en minúscula) a las que apunta
    links: HashMap<String, HashSet<String>>,
    // nombre_nota_minúscula -> ruta física real (ej. "nota a" -> "vault/Nota A.md")
    note_name_to_path: HashMap<String, String>,
}

impl Default for VaultIndex {
    fn default() -> Self {
        Self {
            links: HashMap::new(),
            note_name_to_path: HashMap::new(),
        }
    }
}

struct AppState {
    index: Mutex<VaultIndex>,
}

// 1. Selector Nativo
#[tauri::command]
fn select_directory() -> Option<String> {
    FileDialog::new()
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

// 2. Escáner y Constructor de Árbol Físico
fn scan_dir(path: &Path) -> Result<Vec<FileNode>, String> {
    let mut nodes = Vec::new();
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            if name.starts_with('.') {
                continue;
            }
            
            let is_dir = entry_path.is_dir();
            
            if is_dir {
                let children = scan_dir(&entry_path)?;
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir: true,
                    children,
                });
            } else if entry_path.extension().map_or(false, |ext| ext == "md") {
                nodes.push(FileNode {
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: Vec::new(),
                });
            }
        }
    }
    
    nodes.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });
    
    Ok(nodes)
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let folder_path = Path::new(&path);
    if !folder_path.is_dir() {
        return Err("La ruta proporcionada no es una carpeta válida".to_string());
    }
    scan_dir(folder_path)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_file(parent_path: String, name: String) -> Result<String, String> {
    let mut file_path = Path::new(&parent_path).join(name);
    if file_path.extension().map_or(true, |ext| ext != "md") {
        file_path.set_extension("md");
    }
    fs::write(&file_path, "").map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn create_directory(parent_path: String, name: String) -> Result<String, String> {
    let dir_path = Path::new(&parent_path).join(name);
    fs::create_dir_all(&dir_path).map_err(|e| e.to_string())?;
    Ok(dir_path.to_string_lossy().to_string())
}

fn decode_url(path: &str) -> String {
    let mut decoded = String::new();
    let mut chars = path.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let mut hex = String::new();
            if let Some(&h1) = chars.peek() {
                if h1.is_ascii_hexdigit() {
                    chars.next();
                    hex.push(h1);
                    if let Some(&h2) = chars.peek() {
                        if h2.is_ascii_hexdigit() {
                            chars.next();
                            hex.push(h2);
                        }
                    }
                }
            }
            if hex.len() == 2 {
                if let Ok(val) = u8::from_str_radix(&hex, 16) {
                    decoded.push(val as char);
                    continue;
                }
            }
            decoded.push('%');
            decoded.push_str(&hex);
        } else if c == '+' {
            decoded.push(' ');
        } else {
            decoded.push(c);
        }
    }
    decoded
}

fn extract_stem(path: &str) -> Option<String> {
    let decoded = decode_url(path);
    let trimmed = decoded.trim();
    
    if trimmed.contains("://") || trimmed.starts_with("mailto:") {
        return None;
    }
    
    let filename = match trimmed.rfind('/') {
        Some(idx) => &trimmed[idx + 1..],
        None => match trimmed.rfind('\\') {
            Some(idx) => &trimmed[idx + 1..],
            None => trimmed
        }
    };
    
    if filename.is_empty() {
        return None;
    }
    
    if let Some(dot_idx) = filename.rfind('.') {
        let ext = &filename[dot_idx + 1..].to_lowercase();
        if ext == "md" || ext == "markdown" {
            Some(filename[..dot_idx].to_string())
        } else {
            None
        }
    } else {
        Some(filename.to_string())
    }
}

// 3. Analizador Manual y Eficiente de Backlinks
fn extract_links(content: &str) -> HashSet<String> {
    let mut links = HashSet::new();
    let mut chars = content.char_indices().peekable();
    
    while let Some((_, c)) = chars.next() {
        if c == '[' {
            if chars.peek().map(|&(_, next_c)| next_c) == Some('[') {
                chars.next(); // consumir el segundo '['
                
                let mut link_text = String::new();
                let mut closed = false;
                
                while let Some((_, inner_c)) = chars.next() {
                    if inner_c == ']' && chars.peek().map(|&(_, next_c)| next_c) == Some(']') {
                        chars.next(); // consumir el segundo ']'
                        closed = true;
                        break;
                    }
                    link_text.push(inner_c);
                }
                
                if closed {
                    let target = match link_text.find('|') {
                        Some(idx) => &link_text[..idx],
                        None => &link_text
                    };
                    let trimmed = target.trim().to_string();
                    if !trimmed.is_empty() {
                        links.insert(trimmed.to_lowercase());
                    }
                }
            } else {
                // Potencial enlace estándar [Label](Path)
                let mut label = String::new();
                let mut label_closed = false;
                
                while let Some((_, inner_c)) = chars.next() {
                    if inner_c == ']' {
                        label_closed = true;
                        break;
                    }
                    label.push(inner_c);
                }
                
                if label_closed && chars.peek().map(|&(_, next_c)| next_c) == Some('(') {
                    chars.next(); // consumir '('
                    
                    let mut path = String::new();
                    let mut path_closed = false;
                    
                    while let Some((_, inner_c)) = chars.next() {
                        if inner_c == ')' {
                            path_closed = true;
                            break;
                        }
                        path.push(inner_c);
                    }
                    
                    if path_closed {
                        if let Some(stem) = extract_stem(&path) {
                            let trimmed = stem.trim().to_string();
                            if !trimmed.is_empty() {
                                links.insert(trimmed.to_lowercase());
                            }
                        }
                    }
                }
            }
        }
    }
    links
}

// Escáner e Indexador Recursivo de Bóvedas
fn scan_and_index_dir(path: &Path, index: &mut VaultIndex) {
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            if name.starts_with('.') {
                continue;
            }
            
            if entry_path.is_dir() {
                scan_and_index_dir(&entry_path, index);
            } else if entry_path.extension().map_or(false, |ext| ext == "md") {
                let file_path = entry_path.to_string_lossy().to_string();
                let note_name = entry_path.file_stem().unwrap().to_string_lossy().to_string();
                
                index.note_name_to_path.insert(note_name.to_lowercase(), file_path.clone());
                
                if let Ok(content) = fs::read_to_string(&entry_path) {
                    let file_links = extract_links(&content);
                    index.links.insert(file_path, file_links);
                }
            }
        }
    }
}

// 4. Comandos de Tauri v2 para Indexación e IPC

#[tauri::command]
fn index_vault(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let vault_path = Path::new(&path);
    if !vault_path.is_dir() {
        return Err("La ruta especificada no es una carpeta válida".to_string());
    }
    
    let mut index = state.index.lock().unwrap();
    index.links.clear();
    index.note_name_to_path.clear();
    
    scan_and_index_dir(vault_path, &mut index);
    Ok(())
}

#[tauri::command]
fn get_backlinks(path: String, state: State<'_, AppState>) -> Result<Vec<Backlink>, String> {
    let target_path = Path::new(&path);
    let note_name_lc = target_path
        .file_stem()
        .ok_or_else(|| "Archivo de destino inválido".to_string())?
        .to_string_lossy()
        .to_lowercase();
        
    let index = state.index.lock().unwrap();
    let mut backlinks = Vec::new();
    
    for (src_path, src_links) in &index.links {
        // Evitar autoreferencia
        if src_path != &path && src_links.contains(&note_name_lc) {
            let src_file_path = Path::new(src_path);
            let name = src_file_path
                .file_stem()
                .map_or("Nota Sin Nombre".to_string(), |s| s.to_string_lossy().to_string());
                
            backlinks.push(Backlink {
                name,
                path: src_path.clone(),
            });
        }
    }
    
    backlinks.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(backlinks)
}

#[tauri::command]
fn update_file_index(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let file_path = Path::new(&path);
    if !file_path.is_file() || file_path.extension().map_or(true, |ext| ext != "md") {
        return Ok(());
    }
    
    let mut index = state.index.lock().unwrap();
    let note_name = file_path.file_stem().unwrap().to_string_lossy().to_string();
    index.note_name_to_path.insert(note_name.to_lowercase(), path.clone());
    
    if let Ok(content) = fs::read_to_string(file_path) {
        let file_links = extract_links(&content);
        index.links.insert(path, file_links);
    }
    
    Ok(())
}

#[tauri::command]
fn get_graph_data(state: State<'_, AppState>) -> Result<GraphData, String> {
    let index = state.index.lock().unwrap();
    let mut nodes_map = HashMap::new();
    let mut links = Vec::new();
    
    // 1. Nodos físicos reales
    for (name_lc, path) in &index.note_name_to_path {
        let file_path = Path::new(path);
        let name = file_path
            .file_stem()
            .map_or("Nota Sin Nombre".to_string(), |s| s.to_string_lossy().to_string());
            
        nodes_map.insert(name_lc.clone(), GraphNode {
            id: name,
            path: Some(path.clone()),
            exists: true,
        });
    }
    
    // 2. Conexiones y Notas Fantasmas
    for (src_path, src_links) in &index.links {
        let src_file_path = Path::new(src_path);
        let src_name = src_file_path
            .file_stem()
            .map_or("Nota Sin Nombre".to_string(), |s| s.to_string_lossy().to_string());
            
        for target_lc in src_links {
            let target_name = match index.note_name_to_path.get(target_lc) {
                Some(target_path) => {
                    Path::new(target_path)
                        .file_stem()
                        .map_or("Nota Sin Nombre".to_string(), |s| s.to_string_lossy().to_string())
                }
                None => {
                    if !nodes_map.contains_key(target_lc) {
                        let capitalized = target_lc
                            .split_whitespace()
                            .map(|word| {
                                let mut chars = word.chars();
                                match chars.next() {
                                    None => String::new(),
                                    Some(f) => f.to_uppercase().collect::<String>() + chars.as_str(),
                                }
                            })
                            .collect::<Vec<String>>()
                            .join(" ");
                            
                        nodes_map.insert(target_lc.clone(), GraphNode {
                            id: capitalized,
                            path: None,
                            exists: false,
                        });
                    }
                    nodes_map.get(target_lc).unwrap().id.clone()
                }
            };
            
            links.push(GraphEdge {
                source: src_name.clone(),
                target: target_name,
            });
        }
    }
    
    let nodes = nodes_map.into_values().collect();
    Ok(GraphData { nodes, links })
}

// 5. Comandos Físicos Integrados con Limpieza de Índice

#[tauri::command]
fn rename_item(path: String, new_name: String, state: State<'_, AppState>) -> Result<String, String> {
    let old_path = Path::new(&path);
    let parent = old_path.parent().ok_or("No se encontró directorio padre")?;
    let mut new_path = parent.join(new_name);
    
    if old_path.is_file() && new_path.extension().map_or(true, |ext| ext != "md") {
        new_path.set_extension("md");
    }
    
    let new_path_str = new_path.to_string_lossy().to_string();
    fs::rename(old_path, &new_path).map_err(|e| e.to_string())?;
    
    // Sincronizar el Índice
    let mut index = state.index.lock().unwrap();
    if let Some(links_set) = index.links.remove(&path) {
        index.links.insert(new_path_str.clone(), links_set);
    }
    if let Some(old_stem) = old_path.file_stem() {
        index.note_name_to_path.remove(&old_stem.to_string_lossy().to_lowercase());
    }
    if let Some(new_stem) = new_path.file_stem() {
        index.note_name_to_path.insert(new_stem.to_string_lossy().to_lowercase(), new_path_str.clone());
    }
    
    Ok(new_path_str)
}

#[tauri::command]
fn delete_item(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let target_path = Path::new(&path);
    if target_path.is_dir() {
        fs::remove_dir_all(target_path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(target_path).map_err(|e| e.to_string())?;
    }
    
    // Sincronizar el Índice
    let mut index = state.index.lock().unwrap();
    index.links.remove(&path);
    if let Some(stem) = target_path.file_stem() {
        index.note_name_to_path.remove(&stem.to_string_lossy().to_lowercase());
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            index: Mutex::new(VaultIndex::default()),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            select_directory,
            read_directory,
            read_file,
            write_file,
            create_file,
            create_directory,
            rename_item,
            delete_item,
            index_vault,
            get_backlinks,
            update_file_index,
            get_graph_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
