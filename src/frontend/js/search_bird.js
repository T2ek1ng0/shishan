// const { ipcRenderer } = require('electron') // Removed: using global window.ipcRenderer
// window.ipcRenderer = ipcRenderer // Removed: already set in index.html
async function search_bird(){
    await ipcRenderer.invoke('search_bird_newpage')
}

async function area_search(){
    await ipcRenderer.invoke('area_search')
}

async function name_search(){
    await ipcRenderer.invoke('name_search')
}
