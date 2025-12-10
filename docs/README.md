华南理工大学第二十一届软件文化节“鼎甲杯”软件设计大赛PC端参赛作品是也

你记不记得是谁一把屎一把尿把你从一个3年前的ipynb带大！ 是谁半夜下雨天抱着你发烧的exe冲进DevTools！ 是谁斥巨内存打包整个PyTorch和resnet50环境，结果大小超过2G只能用nsisbi换掉nsis！ 是谁拿着setup.exe到处传人人都说安装包损坏，排查一整天才发现你的安装包是双文件结构！

特别感谢：Gemini-3pro，Gemini-2.5pro，Chatgpt-5.1（排名分先后）

### 训练鸟类分类模型

load_dataset.py下载dataset，get_dataset.py解包dataset，resnet_train.py训练模型，model_eval.py评估模型。

model_predict.py可以对单张照片输出预测结果(准确率几乎为0笑嘻了，可能训练用的dataset不带亚洲鸟玩吧)

### 运行屎山程序

安装依赖

```
cd {你存放代码的文件夹}
npm init -y
# 可以试试设置淘宝镜像源，gpt说会更快但本人用淘宝镜像源也下了8分钟。。
#npm config set registry https://registry.npmmirror.com
npm install electron --save-dev
npm install axios
pip install pyinstaller
npm install @supabase/supabase-js
```

打包python脚本

```
cd {你存放代码的文件夹}
pyinstaller --onedir --name model_predict --add-data "my_model.pth:." --add-data "class_to_label.json:." --exclude-module panel --exclude-module matplotlib --exclude-module PIL.tests model_predict.py
```

运行

由于调用了大模型API，请自行替换`\src\frontend\js\main.js`(约269-274行)和`\src\backend\supabase_config.js`(约5-6行)中有关API调用的内容

```
cd {你存放代码的文件夹}
npm start
```

dataset：https://hf-mirror.com/datasets/yashikota/birds-525-species-image-classification

模型：https://www.kaggle.com/code/vencerlanz09/bird-classification-using-cnn-efficientnetb0  ，在gpt的助力下换成了pytorch和resnet

### 如何把屎山打包成exe

安装依赖

```
npm install --save-dev electron-builder
# 下载winCodeSign
https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z
把下载好的压缩包内的文件拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0里
# 因nsis打包软件大小超过2G时会报错[File: failed creating mmap of "xxx.nsis.7z"]，故在此下载nsisbi
https://sourceforge.net/projects/nsisbi/
把下载好的压缩包内的文件拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1里
# 下载nsis
https://repo.huaweicloud.com/electron-builder-binaries/nsis-3.0.4.1/nsis-3.0.4.1.7z
把压缩包内的elevate.exe拷贝进C:\Users\{你的用户名}\AppData\Local\electron-builder\Cache\nsis\nsis-3.0.4.1里
```

```
cd {你存放代码的文件夹}
# 以下操作需要管理员权限
npm run dist
```

感谢：https://blog.csdn.net/qq_30795779/article/details/127428030

然GitHub Release 的单个文件上限是 2 GB，为了塞进release

```
cd {你存放代码的文件夹\build_output}
# 需要把7z添加进环境变量
7z a birdwatching_setup.7z birdwatching_handbook_Setup.exe birdwatching_handbook_Setup.nsisbin -v1900m
```

然后依次上传分卷即可。

安装说明：
1. 下载所有分卷（.001, .002, .003, .004）
2. 确保它们放在同一个文件夹中
3. 使用 7-Zip 打开 birdwatching_setup.7z.001 并解压
4. 解压后会得到：
   - birdwatching_handbook_Setup.exe
   - birdwatching_handbook_Setup.nsisbin
5. 双击 birdwatching_handbook_Setup.exe 开始安装
   安装过程中，进度条抽风是正常现象，请不用担心。