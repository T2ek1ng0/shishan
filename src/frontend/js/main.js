const {app, BrowserWindow, ipcMain, Menu, dialog} = require('electron')
const { spawn } = require('child_process');
const path = require('path')
const fs = require('fs')
const axios = require('axios')
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
    let menutemp = [
        {
            label: '关于',
            submenu: [
                {
                    label:'关于我',
                    click(){
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '关于我',
                            message: '在所有人眼中，稿子件都是地球之主。',
                            buttons: ['确定'],
                            noLink: true,
                        })
                    }
                },
            ]
        },
    ]
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
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
        title: '选择图片',
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
        properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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

ipcMain.handle('get_records', async () => {
    if (!fs.existsSync(RECORDS_FILE)) return []
    const data = fs.readFileSync(RECORDS_FILE, 'utf-8')
    return JSON.parse(data)
})

ipcMain.handle('add_record', async (event, record) => {
    let records = []
    if (fs.existsSync(RECORDS_FILE)) {
        records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'))
    }
    records.push(record)
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
    return true
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

ipcMain.handle('delete_record', async (event, index) => {
    if (!fs.existsSync(RECORDS_FILE)) return false;
    let records = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
    if (index < 0 || index >= records.length) return false;
    records.splice(index, 1)
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8');
    return true;
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
    if (!fs.existsSync(MAP_RECORDS_FILE)) return []
    return JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
})

ipcMain.handle('add_map_record', async (event, record) => {
    let records = []
    if (fs.existsSync(MAP_RECORDS_FILE)) {
        records = JSON.parse(fs.readFileSync(MAP_RECORDS_FILE, 'utf-8'))
    }
    records.push(record)
    fs.writeFileSync(MAP_RECORDS_FILE, JSON.stringify(records, null, 2), 'utf-8')
    return true
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