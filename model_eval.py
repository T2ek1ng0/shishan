import os
import cv2
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt
import torch
from torchvision import transforms, models
from torch.utils.data import Dataset, DataLoader
from pathlib import Path
import pandas as pd
from model_train import BirdDataset  # 复用 Dataset 定义
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

sns.set_style('darkgrid')
BATCH_SIZE = 32
TARGET_SIZE = (224, 224)
NUM_CLASSES = 525  # 数据集类别数
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 1. 数据加载
dataset_path = Path("dataset/train")
filepaths = list(dataset_path.glob('**/*.JPG')) + \
            list(dataset_path.glob('**/*.jpg')) + \
            list(dataset_path.glob('**/*.png'))

labels = [x.parent.name for x in filepaths]
filepaths = pd.Series(filepaths, name='Filepath').astype(str)
labels = pd.Series(labels, name='Label')
image_df = pd.concat([filepaths, labels], axis=1)

# 2. 数据增强
train_transforms = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize(TARGET_SIZE),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(10),
    transforms.RandomResizedCrop(TARGET_SIZE),
    transforms.ColorJitter(contrast=0.1, brightness=0.1),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

val_transforms = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize(TARGET_SIZE),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

# 3. 数据集划分
train_df, test_df = train_test_split(image_df, test_size=0.2, random_state=42)
train_df, val_df = train_test_split(train_df, test_size=0.2, random_state=42)

train_dataset = BirdDataset(train_df, transform=train_transforms)
val_dataset = BirdDataset(val_df, transform=val_transforms)
test_dataset = BirdDataset(test_df, transform=val_transforms)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

# 4. 加载模型（ResNet）
model = models.resnet50(pretrained=False)
in_features = model.fc.in_features
model.fc = torch.nn.Sequential(
    torch.nn.Linear(in_features, 256),
    torch.nn.ReLU(),
    torch.nn.Dropout(0.4),
    torch.nn.Linear(256, NUM_CLASSES)
)

# 加载最新模型权重
ckpt_dir = "model_resnet50"
pth_files = [f for f in os.listdir(ckpt_dir) if f.endswith(".pth")]
latest_ckpt = max(pth_files, key=lambda f: os.path.getmtime(os.path.join(ckpt_dir, f)))
model.load_state_dict(torch.load(os.path.join(ckpt_dir, latest_ckpt), map_location=device))
model.to(device)
model.eval()
print(f"Model loaded successfully: {latest_ckpt}")

# 5. 模型评估
y_true, y_pred = [], []
with torch.no_grad():
    for imgs, labels in test_loader:
        imgs, labels = imgs.to(device), labels.to(device)
        outputs = model(imgs)
        _, preds = torch.max(outputs, 1)
        y_true.extend(labels.cpu().numpy())
        y_pred.extend(preds.cpu().numpy())

print("Classification Report:")
print(classification_report(y_true, y_pred))

# 6. 可视化预测结果
random_index = np.random.randint(0, len(test_df), 15)
fig, axes = plt.subplots(3, 5, figsize=(25, 15))
label_map = {v: k for k, v in train_dataset.label_map.items()}

for i, ax in enumerate(axes.flat):
    img_path = test_df.Filepath.iloc[random_index[i]]
    img = plt.imread(img_path)
    true_label = test_df.Label.iloc[random_index[i]]
    img_tensor = val_transforms(cv2.imread(img_path)[:, :, ::-1])
    img_tensor = img_tensor.unsqueeze(0).to(device)
    with torch.no_grad():
        output = model(img_tensor)
        pred_idx = torch.argmax(output, 1).item()
        pred_label = label_map[pred_idx]
    color = "green" if true_label == pred_label else "red"
    ax.imshow(img)
    ax.set_title(f"True: {true_label}\nPred: {pred_label}", color=color)
    ax.axis('off')

plt.tight_layout()
plt.show()


