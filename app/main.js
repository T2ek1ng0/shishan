const {app, BrowserWindow, ipcMain, Menu, dialog} = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const RECORDS_FILE = path.join(__dirname, 'records.json')
if (!fs.existsSync(RECORDS_FILE)) {
    fs.writeFileSync(RECORDS_FILE, JSON.stringify([]), 'utf-8')
}


let mainWindow
function createWindow(){
    mainWindow = new BrowserWindow({
        // x: 200,
        // y: 200,
        width: 600,
        height: 400,
        show: false,
        resizable: false,
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
    mainWindow.loadFile('index.html')
    mainWindow.on('ready-to-show', ()=> mainWindow.show())
    mainWindow.on('close', ()=> mainWindow = null)
}
app.whenReady().then(createWindow)
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
        title: '选择图片',
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
        properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
})
ipcMain.handle('open-image-selector', async () => {
    const selectWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        modal: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    selectWin.setMenu(null)
    selectWin.loadFile(path.join(__dirname, 'select_img.html'))
})


// 调用 Python 进行分类
ipcMain.handle('classify-image', async (event, imagePath) => {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', 'model_predict.py')

        const pythonProcess = spawn('python', [pythonScript, imagePath], {
            cwd: path.join(__dirname, '..'),
        })

        let output = ''
        pythonProcess.stdout.on('data', (data) => (output += data.toString()))
        pythonProcess.stderr.on('data', (data) => console.error('Python error:', data.toString()))

        pythonProcess.on('close', (code) => {
            if (code === 0) resolve(output.trim())
            else reject(`Python exited with code ${code}`)
        })
    })
})

let bird_searchWin
ipcMain.handle('search_bird_newpage', async()=>{
    bird_searchWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        modal: true,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    bird_searchWin.setMenu(null)
    bird_searchWin.loadFile("bird_select_page.html")
    //bird_selectpageWin.webContents.openDevTools()
    bird_searchWin.on('ready-to-show',()=> bird_searchWin.show())
    bird_searchWin.on('close',()=> bird_searchWin = null)
})

ipcMain.handle('area_search', async()=>{
    bird_searchWin.loadFile("area_search.html")
})

ipcMain.handle('name_search', async()=>{
    bird_searchWin.loadFile("name_search.html")
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
    recomWin = new BrowserWindow({
        width: 500,
        height: 600,
        parent: mainWindow,
        modal: true,
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    })
    recomWin.setMenu(null)
    recomWin.loadFile("recommend.html")
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
    recordsWin.loadFile('records.html')
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
        resizable: false,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })
    addRecordWin.setMenu(null)
    addRecordWin.loadFile('add_record.html')
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
