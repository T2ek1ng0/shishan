load_dataset.py下载dataset，get_dataset.py解包dataset，resnet_train.py训练模型，model_eval.py评估模型。

model_predict.py可以对单张照片输出预测结果(准确率几乎为0，笑嘻了，可能训练用的dataset不带亚洲鸟玩吧)

cd进入app

```
npm init -y
#可以试试设置淘宝镜像源，gpt说会更快但本人用淘宝镜像源也下了8分钟。。
#npm config set registry https://registry.npmmirror.com
npm install electron --save-dev
npm install axios
```

下载好electron之后，在app文件夹里打开终端，输入npm start就可以运行全ai0人工的前端小程序了。

dataset来源:https://hf-mirror.com/datasets/yashikota/birds-525-species-image-classification

模型:https://www.kaggle.com/code/vencerlanz09/bird-classification-using-cnn-efficientnetb0  ，在gpt的助力下换了pytorch和resnet。