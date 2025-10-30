const { ipcRenderer } = require('electron')

async function bird_classify() {
    const imagePath = await ipcRenderer.invoke('open-image-selector')
    if (!imagePath) return

    const imgElement = document.getElementById('preview')
    imgElement.src = imagePath
    imgElement.style.display = 'block'

    const resultElement = document.getElementById('result')
    resultElement.innerText = '正在预测，请稍候...'

    try {
        const result = await ipcRenderer.invoke('classify-image', imagePath)
        resultElement.innerText = `预测结果：${result}`
    } catch (err) {
        resultElement.innerText = `预测出错：${err}`
    }
}
