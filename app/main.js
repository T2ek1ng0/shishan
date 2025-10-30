const {app, BrowserWindow, ipcMain, Menu, dialog} = require('electron')
const { spawn } = require('child_process')
const path = require('path')
let mainWindow
function createWindow(){
    mainWindow = new BrowserWindow({
        // x: 200,
        // y: 200,
        width: 600,
        height: 400,
        show: false,
        maxWidth: 600,
        minWidth: 600,
        maxHeight: 400,
        minHeight: 400,
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
    mainWindow.loadFile('index.html')
    mainWindow.on('ready-to-show', ()=>{
        mainWindow.show()
    })
    mainWindow.on('close', ()=>{
        console.log('mainWindow is closed')
        mainWindow = null
    })
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
