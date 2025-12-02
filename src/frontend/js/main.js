const {app, BrowserWindow, ipcMain, Menu, dialog} = require('electron')
const { spawn } = require('child_process');
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const { createClient } = require('@supabase/supabase-js')
const { SUPABASE_URL, SUPABASE_KEY } = require('../../backend/supabase_config')

// 初始化 Supabase 客户端
// 自定义存储适配器，用于在 Electron 主进程中持久化 Session
const storagePath = path.join(app.getPath('userData'), 'supabase-session.json')
const customStorage = {
    getItem: (key) => {
        try {
            if (!fs.existsSync(storagePath)) return null
            const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            return data[key]
        } catch (e) {
            return null
        }
    },
    setItem: (key, value) => {
        try {
            let data = {}
            if (fs.existsSync(storagePath)) {
                data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            }
            data[key] = value
            fs.writeFileSync(storagePath, JSON.stringify(data), 'utf-8')
        } catch (e) {
            console.error('Error saving session:', e)
        }
    },
    removeItem: (key) => {
        try {
            if (!fs.existsSync(storagePath)) return
            let data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'))
            delete data[key]
            fs.writeFileSync(storagePath, JSON.stringify(data), 'utf-8')
        } catch (e) {
            console.error('Error removing session:', e)
        }
    }
}

const supabase = (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL') 
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            storage: customStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false
        }
    }) 
    : null;

// 仍然保留本地文件路径作为备份或缓存（可选），但主要逻辑将切换到 Supabase
const RECORDS_FILE = app.isPackaged?path.join(process.resourcesPath, 'records.json'):path.join(__dirname, '../../../data/records.json')
if (!fs.existsSync(RECORDS_FILE)) {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify([]), 'utf-8')
}

let mainWindow
function createWindow(){
    mainWindow = new BrowserWindow({
        // x: 200,
        // y: 200,
        width: 1200,
        height: 900,
        show: false,
        resizable: true,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })
    let menutemp = []
    let menu = Menu.buildFromTemplate(menutemp)
    Menu.setApplicationMenu(menu)
    //mainWindow.webContents.openDevTools()
    mainWindow.loadFile(path.join(__dirname, '../html/index.html'))
    mainWindow.on('ready-to-show', ()=> mainWindow.show())
    mainWindow.on('close', ()=> mainWindow = null)
}
let pythonProcess
let isPythonReady = false
// 缓存回调，等待每次 stdout 返回
let stdoutBuffer = ''
let pendingResolve = null
app.whenReady().then(()=>{
    createWindow()
    const exePath = app.isPackaged
        ? path.join(process.resourcesPath, 'model_predict', 'model_predict.exe') // 打包后的路径
        : path.join(__dirname, '../../../dist/model_predict/model_predict.exe') // 开发时的路径
    console.log('Python exe path:', exePath);
    pythonProcess = spawn(exePath, [], { stdio: ['pipe', 'pipe', 'pipe'] })

    pythonProcess.stderr.on('data', (data) => {
        console.error('Python error:', data.toString());
    });

    pythonProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();

        // 关键：打开开发者工具看这个日志
        console.log("Python STDOUT raw:", data.toString());

        // 循环处理 buffer 中所有完整的行
        while (stdoutBuffer.includes('\n')) {
            const newlineIndex = stdoutBuffer.indexOf('\n');
            const line = stdoutBuffer.substring(0, newlineIndex).trim();
            stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);

            if (line === 'MODEL_READY') {
                console.log("Python Model is READY.");
                isPythonReady = true;
            }
            else if (pendingResolve && line) {
                // 确保 line 不是空字符串
                console.log("Resolving classification with:", line)
                pendingResolve(line);
                pendingResolve = null;
            }
            else if (line) {
                console.log("Python stdout (ignored):", line);
            }
            // 如果 line 是空的 (e.g., " \n"), 就忽略它
        }
    })
})
ipcMain.handle('select-image', async (event, allowMultiple = false) => {
    const result = await dialog.showOpenDialog({
        title: '选择图片',
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
        properties: ['openFile', allowMultiple ? 'multiSelections' : null].filter(Boolean)
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return allowMultiple ? result.filePaths : result.filePaths[0]
})
let selectImgWin
ipcMain.handle('open-image-selector', async () => {
    if (selectImgWin) {
        selectImgWin.focus()
        return
    }
    selectImgWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        // modal: true,
        resizable: true,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    selectImgWin.setMenu(null)
    selectImgWin.loadFile(path.join(__dirname, '../html/select_img.html'))
    selectImgWin.on('closed', () => selectImgWin = null)
})


// 调用 Python 进行分类
ipcMain.handle('classify-image', async (event, imagePath) => {
    if (!isPythonReady) {
        console.warn("Python model is not ready yet.");
        dialog.showErrorBox("模型加载中", "图片识别引擎仍在加载中，请稍后再试。");
        return null; // 或者 throw new Error(...)
    }
    return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pythonProcess.stdin.write(imagePath + '\n');
    })
})

let bird_searchWin
ipcMain.handle('search_bird_newpage', async()=>{
    if (bird_searchWin) {
        bird_searchWin.focus()
        return
    }
    bird_searchWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        // modal: true,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    bird_searchWin.setMenu(null)
    bird_searchWin.loadFile(path.join(__dirname, "../html/bird_select_page.html"))
    //bird_selectpageWin.webContents.openDevTools()
    bird_searchWin.on('ready-to-show',()=> bird_searchWin.show())
    bird_searchWin.on('close',()=> bird_searchWin = null)
})

ipcMain.handle('area_search', async()=>{
    bird_searchWin.loadFile(path.join(__dirname, "../html/area_search.html"))
})

ipcMain.handle('name_search', async()=>{
    bird_searchWin.loadFile(path.join(__dirname, "../html/name_search.html"))
})

ipcMain.handle('area_searcher', async(event, area)=>{
    const prompt = `「${area}」地区常见的鸟类有哪些？请简要概述`
    try {
        return await call_llm(prompt)
    }
    catch (err) {
        return `调用llm出错：${err.message}`;
    }
})

ipcMain.handle('name_searcher', async(event, name)=>{
    const prompt = `请确认是否存在「${name}」这种鸟。如存在，请简要概述其基本习性和特征`
    try {
        return await call_llm(prompt)
    }
    catch (err) {
        return `调用llm出错：${err.message}`;
    }
})

let recomWin
ipcMain.handle('todays_newpage', async()=>{
    if (recomWin) {
        recomWin.focus()
        return
    }
    recomWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        // modal: true,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    recomWin.setMenu(null)
    recomWin.loadFile(path.join(__dirname, "../html/recommend.html"))
    recomWin.on('ready-to-show',()=> recomWin.show())
    recomWin.on('close', ()=> recomWin = null)
})

ipcMain.handle('todays_recommend', async(event, area)=>{
    const now = new Date()
    const nowStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`
    const prompt = `请推荐今日「${nowStr}」在「${area}」适合观鸟的地点，以及在你推荐地点能观察到的鸟类，简要概述即可`
    try {
        return await call_llm(prompt)
    }
    catch (err) {
        return `调用llm出错：${err.message}`;
    }
})

const API_KEY = "sk-1817f4e4e7254f70aa6c45b957b4cc5c"
const APP_ID = "2f91c1b54ec149f6b0ab4394169dd714"
async function call_llm(promptText){
    try {
        const response = await axios.post(
            `https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`,
            {
                input: {
                    prompt: promptText
                },
                parameters: {},
                debug: {},
            },
            {
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json",
                }
            }
        )
        return response.data.output?.text || JSON.stringify(response.data)

    } catch (err) {
        console.error('llm请求失败：', err)
        throw new Error(err.response?.data?.message || err.message || '未知错误')
    }
}

let recordsWin
ipcMain.handle('open_records', async()=>{
    if (recordsWin) {
        recordsWin.focus()
        return
    }
    recordsWin = new BrowserWindow({
        width: 1000,
        height: 800,
        // parent: mainWindow,
        // modal: false,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    recordsWin.setMenu(null)
    recordsWin.loadFile(path.join(__dirname, '../html/records.html'))
    //recordsWin.webContents.openDevTools()
    recordsWin.on('ready-to-show', () => recordsWin.show())
    recordsWin.on('close', () => recordsWin = null)
})

// Helper for Supabase retries
async function supabaseWithRetry(operation, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const result = await operation();
            // If result is null/undefined (e.g. from a void function), treat as success
            if (!result) return result;
            // If result has error property, treat as failure
            if (result.error) {
                lastError = result.error;
                console.warn(`Supabase operation failed (attempt ${i + 1}/${maxRetries}):`, lastError.message);
            } else {
                return result;
            }
        } catch (err) {
            lastError = err;
            console.warn(`Supabase operation threw (attempt ${i + 1}/${maxRetries}):`, err.message);
        }
        // Wait before retrying (exponential backoff: 1s, 2s, 4s)
        if (i < maxRetries - 1) await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
    return { data: null, error: lastError };
}

// Helper to get user with retry
async function getUserWithRetry() {
    if (!supabase) return { data: { user: null } };
    return await supabaseWithRetry(() => supabase.auth.getUser());
}

ipcMain.handle('get_records', async () => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) return []

        const { data, error } = await supabaseWithRetry(() => supabase
            .from('records')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        )
        
        if (error) {
            console.error('Supabase get_records error:', error)
            return []
        }
        return data
    } else {
        // Fallback to local file
        if (!fs.existsSync(RECORDS_FILE)) return []
        const data = fs.readFileSync(RECORDS_FILE, 'utf-8')
        return JSON.parse(data)
    }
})

ipcMain.handle('add_record', async (event, record) => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) throw new Error('User not logged in')

        const { error } = await supabaseWithRetry(() => supabase
            .from('records')
            .insert([{ ...record, user_id: user.id }])
        )
        
        if (error) {
            console.error('Supabase add_record error:', error)
            throw error
        }
        return true
    } else {
        let records = []
        if (fs.existsSync(RECORDS_FILE)) {
            records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'))
        }
        records.push(record)
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
        return true
    }
})

let addRecordWin
ipcMain.handle('open_add_record_window', async () => {
    if (addRecordWin) return
    addRecordWin = new BrowserWindow({
        width: 400,
        height: 350,
        parent: recordsWin,
        modal: true,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })
    addRecordWin.setMenu(null)
    addRecordWin.loadFile(path.join(__dirname, '../html/add_record.html'))
    addRecordWin.on('ready-to-show', () => addRecordWin.show())
    addRecordWin.on('close', () => addRecordWin = null)
})

ipcMain.handle('delete_record', async (event, { index, id }) => {
    if (supabase) {
        if (!id) return false
        const { error } = await supabaseWithRetry(() => 
            supabase.from('records').delete().eq('id', id)
        )
        
        if (error) {
            console.error('Supabase delete_record error:', error)
            throw new Error(error.message || 'Delete failed')
        }
        return true
    } else {
        if (!fs.existsSync(RECORDS_FILE)) return false;
        let records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
        if (index < 0 || index >= records.length) return false;
        records.splice(index, 1)
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

const MAP_RECORDS_FILE = app.isPackaged ? path.join(process.resourcesPath, 'map_records.json') : path.join(__dirname, '../../../data/map_records.json')
if (!fs.existsSync(MAP_RECORDS_FILE)) {
    fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify([]), 'utf-8')
}

let mapWin
ipcMain.handle('open_map_window', async () => {
    if (mapWin) {
        mapWin.focus()
        return
    }
    mapWin = new BrowserWindow({
        width: 1000,
        height: 800,
        resizable: true,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // 允许加载本地图片
        }
    })
    mapWin.setMenu(null)
    mapWin.loadFile(path.join(__dirname, '../html/map.html'))
    mapWin.on('ready-to-show', () => mapWin.show())
    mapWin.on('close', () => mapWin = null)
})

ipcMain.handle('get_map_records', async () => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        // if (!user) return [] // Allow viewing without login? Or maybe just return all.
        // Let's allow viewing all records even if not logged in, but we need user to know "is_mine"

        const { data, error } = await supabaseWithRetry(() => supabase
            .from('map_records')
            .select('*, profiles(username, avatar_url)')
        )
        
        if (error) {
            console.error('Supabase get_map_records error:', error)
            return []
        }
        
        return data.map(r => ({
            ...r,
            is_mine: user ? r.user_id === user.id : false
        }))
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return []
        return JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
    }
})

ipcMain.handle('add_map_record', async (event, record) => {
    if (supabase) {
        const { data: { user } } = await getUserWithRetry()
        if (!user) throw new Error('User not logged in')

        let imageUrls = [];
        
        // Handle multiple images
        if (record.images && Array.isArray(record.images)) {
            for (const imgPath of record.images) {
                if (fs.existsSync(imgPath)) {
                    try {
                        const fileBuffer = fs.readFileSync(imgPath);
                        const fileName = `map_images/${Date.now()}_${Math.random().toString(36).substring(7)}_${path.basename(imgPath)}`;
                        
                        const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                            .from('birds')
                            .upload(fileName, fileBuffer, {
                                contentType: 'image/jpeg'
                            })
                        );

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage
                                .from('birds')
                                .getPublicUrl(fileName);
                            imageUrls.push(publicUrl);
                        }
                    } catch (err) {
                        console.error('Image upload failed:', err);
                    }
                }
            }
        }
        // Fallback/Legacy single image
        else if (record.image && fs.existsSync(record.image)) {
            try {
                const fileBuffer = fs.readFileSync(record.image);
                const fileName = `map_images/${Date.now()}_${path.basename(record.image)}`;
                const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                    .from('birds')
                    .upload(fileName, fileBuffer, { contentType: 'image/jpeg' })
                );
                if (!uploadError) {
                    const { data: { publicUrl } } = supabase.storage.from('birds').getPublicUrl(fileName);
                    imageUrls.push(publicUrl);
                }
            } catch (err) { console.error('Legacy image upload failed:', err); }
        }

        const newRecord = { 
            ...record, 
            images: imageUrls, 
            image: imageUrls[0] || null, // Keep legacy field populated
            user_id: user.id 
        };
        delete newRecord.id; 

        const { error } = await supabaseWithRetry(() => supabase
            .from('map_records')
            .insert([newRecord])
        )
        
        if (error) {
            console.error('Supabase add_map_record error:', error)
            throw error
        }
        return true
    } else {
        let records = []
        if (fs.existsSync(MAP_RECORDS_FILE)) {
            records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
        }
        records.push(record)
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
        return true
    }
})

// Social Features Handlers
ipcMain.handle('get_record_interactions', async (event, recordId) => {
    if (!supabase) return { likes: 0, comments: [], is_liked: false };
    
    const { data: { user } } = await getUserWithRetry();

    // Get Likes Count
    const { count: likesCount } = await supabaseWithRetry(() => supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('record_id', recordId)
    );

    // Check if current user liked
    let isLiked = false;
    if (user) {
        const { data } = await supabaseWithRetry(() => supabase
            .from('likes')
            .select('id')
            .eq('record_id', recordId)
            .eq('user_id', user.id)
            .maybeSingle()
        );
        isLiked = !!data;
    }

    // Get Comments
    const { data: comments } = await supabaseWithRetry(() => supabase
        .from('comments')
        .select('*, profiles(username, avatar_url)')
        .eq('record_id', recordId)
        .order('created_at', { ascending: true })
    );

    return { likes: likesCount || 0, comments: comments || [], is_liked: isLiked };
});

ipcMain.handle('toggle_like', async (event, recordId) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { data } = await supabaseWithRetry(() => supabase
        .from('likes')
        .select('id')
        .eq('record_id', recordId)
        .eq('user_id', user.id)
        .maybeSingle()
    );

    if (data) {
        await supabaseWithRetry(() => supabase.from('likes').delete().eq('id', data.id));
        return false; // unliked
    } else {
        await supabaseWithRetry(() => supabase.from('likes').insert([{ record_id: recordId, user_id: user.id }]));
        return true; // liked
    }
});

ipcMain.handle('add_comment', async (event, { recordId, content }) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { error } = await supabaseWithRetry(() => supabase
        .from('comments')
        .insert([{ record_id: recordId, user_id: user.id, content }])
    );
    
    if (error) throw error;
    return true;
});

ipcMain.handle('delete_comment', async (event, commentId) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) throw new Error('请先登录');

    const { error } = await supabaseWithRetry(() => supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', user.id) // Double check ownership, though RLS handles it
    );
    
    if (error) throw error;
    return true;
});

ipcMain.handle('get_current_user_profile', async () => {
    if (!supabase) return null;
    const { data: { user } } = await getUserWithRetry();
    if (!user) return null;
    
    const { data: profile } = await supabaseWithRetry(() => supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
    );
        
    return { ...user, profile };
});

ipcMain.handle('update_profile', async (event, { username, avatarPath }) => {
    if (!supabase) return false;
    const { data: { user } } = await getUserWithRetry();
    if (!user) return false;

    let avatarUrl = null;
    if (avatarPath && fs.existsSync(avatarPath)) {
        try {
            const fileBuffer = fs.readFileSync(avatarPath);
            const fileName = `avatars/${user.id}_${Date.now()}.jpg`;
            
            const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                .from('birds') 
                .upload(fileName, fileBuffer, { contentType: 'image/jpeg', upsert: true })
            );

            if (uploadError) {
                console.error("Avatar upload error:", uploadError);
                return { success: false, error: '头像上传失败: ' + uploadError.message };
            }

            const { data: { publicUrl } } = supabase.storage.from('birds').getPublicUrl(fileName);
            avatarUrl = publicUrl;
            
        } catch (e) { 
            console.error("Avatar upload exception:", e); 
            return { success: false, error: '头像上传出错: ' + e.message };
        }
    }

    const updates = { updated_at: new Date() };
    if (username) updates.username = username;
    if (avatarUrl) updates.avatar_url = avatarUrl;

    const { error } = await supabaseWithRetry(() => supabase
        .from('profiles')
        .upsert({ id: user.id, ...updates })
    );
    
    if (error) return { success: false, error: error.message };
    return { success: true };
});

ipcMain.handle('update_record', async (event, { id, index, record }) => {
    if (supabase) {
        if (!id) return false
        const { error } = await supabase
            .from('records')
            .update(record)
            .eq('id', id)
        
        if (error) {
            console.error('Supabase update_record error:', error)
            throw error
        }
        return true
    } else {
        if (!fs.existsSync(RECORDS_FILE)) return false;
        let records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
        if (index < 0 || index >= records.length) return false;
        records[index] = { ...records[index], ...record };
        fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

ipcMain.handle('delete_map_record', async (event, { id, index }) => {
    if (supabase) {
        if (!id) return false
        const { error } = await supabaseWithRetry(() => 
            supabase.from('map_records').delete().eq('id', id)
        )
        
        if (error) {
            console.error('Supabase delete_map_record error:', error)
            throw new Error(error.message || 'Delete failed')
        }
        return true
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return false;
        let records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'));
        if (index < 0 || index >= records.length) return false;
        records.splice(index, 1)
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

ipcMain.handle('update_map_record', async (event, { id, index, record }) => {
    if (supabase) {
        if (!id) return false

        let imageUrls = [];
        // Handle images (mix of existing URLs and new local paths)
        if (record.images && Array.isArray(record.images)) {
            for (const imgPath of record.images) {
                if (typeof imgPath === 'string' && (imgPath.startsWith('http') || imgPath.startsWith('//'))) {
                    imageUrls.push(imgPath);
                } else if (typeof imgPath === 'string' && fs.existsSync(imgPath)) {
                    try {
                        const fileBuffer = fs.readFileSync(imgPath);
                        const fileName = `map_images/${Date.now()}_${Math.random().toString(36).substring(7)}_${path.basename(imgPath)}`;
                        
                        const { error: uploadError } = await supabaseWithRetry(() => supabase.storage
                            .from('birds')
                            .upload(fileName, fileBuffer, { contentType: 'image/jpeg' })
                        );

                        if (!uploadError) {
                            const { data: { publicUrl } } = supabase.storage.from('birds').getPublicUrl(fileName);
                            imageUrls.push(publicUrl);
                        }
                    } catch (err) {
                        console.error('Image upload failed:', err);
                    }
                }
            }
        }

        const updates = {
            ...record,
            images: imageUrls,
            image: imageUrls[0] || null
        };
        delete updates.id; // Ensure ID is not updated

        const { error } = await supabase
            .from('map_records')
            .update(updates)
            .eq('id', id)
        
        if (error) {
            console.error('Supabase update_map_record error:', error)
            throw error
        }
        return true
    } else {
        if (!fs.existsSync(MAP_RECORDS_FILE)) return false;
        let records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'));
        if (index < 0 || index >= records.length) return false;
        records[index] = { ...records[index], ...record };
        fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
        return true;
    }
})

// Auth Handlers
let loginWin
ipcMain.handle('open_login_window', async () => {
    if (loginWin) {
        loginWin.focus()
        return
    }
    loginWin = new BrowserWindow({
        width: 500,
        height: 600,
        resizable: false,
        show: false,
        icon: path.join(__dirname, '../assets/favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    loginWin.setMenu(null)
    loginWin.loadFile(path.join(__dirname, '../html/login.html'))
    loginWin.on('ready-to-show', () => loginWin.show())
    loginWin.on('close', () => loginWin = null)
})

ipcMain.handle('auth-login', async (event, { email, password }) => {
    if (!supabase) return { success: false, error: 'Supabase not configured' }
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user }
})

ipcMain.handle('auth-register', async (event, { email, password }) => {
    if (!supabase) return { success: false, error: 'Supabase not configured' }
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    })

    if (error) return { success: false, error: error.message }
    return { success: true, user: data.user }
})

ipcMain.handle('auth-logout', async () => {
    if (!supabase) return { success: false }
    const { error } = await supabase.auth.signOut()
    if (error) return { success: false, error: error.message }
    return { success: true }
})

ipcMain.handle('get-current-user', async () => {
    if (!supabase) return null
    const { data: { session } } = await supabase.auth.getSession()
    return session ? session.user : null
})

const cleanUp = () => {
    if (pythonProcess && !pythonProcess.killed) {
        pythonProcess.kill('SIGTERM')
    }
}

// 当所有窗口都关闭时
app.on('window-all-closed', () => {
    cleanUp()
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// 应用退出前
app.on('before-quit', () => {
    cleanUp()
})

// Node 进程本身退出时
process.on('exit', cleanUp)