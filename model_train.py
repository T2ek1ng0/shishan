import os
import random
from pathlib import Path
import matplotlib
matplotlib.use('TkAgg')
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import cv2
from tqdm import tqdm
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

sns.set_style('darkgrid')
BATCH_SIZE = 32
TARGET_SIZE = (224, 224)
NUM_CLASSES = 525  # 根据你的数据集修改

# 1. 数据加载
dataset_path = Path("dataset/train")
filepaths = list(dataset_path.glob('**/*.JPG')) + \
            list(dataset_path.glob('**/*.jpg')) + \
            list(dataset_path.glob('**/*.png'))

labels = [x.parent.name for x in filepaths]

filepaths = pd.Series(filepaths, name='Filepath').astype(str)
labels = pd.Series(labels, name='Label')
image_df = pd.concat([filepaths, labels], axis=1)
'''
# 可视化前20类
label_counts = image_df['Label'].value_counts()[:20]
plt.figure(figsize=(20, 6))
sns.barplot(x=label_counts.index, y=label_counts.values, palette='dark:salmon_r')
plt.xticks(rotation=45)
plt.show()

# 随机展示图片
random_index = np.random.randint(0, len(image_df), 16)
fig, axes = plt.subplots(4, 4, figsize=(10, 10))
for i, ax in enumerate(axes.flat):
    img = plt.imread(image_df.Filepath[random_index[i]])
    ax.imshow(img)
    ax.set_title(image_df.Label[random_index[i]])
    ax.axis('off')
plt.tight_layout()
plt.show()
'''
# 2. PyTorch Dataset
class BirdDataset(Dataset):
    def __init__(self, df, transform=None):
        self.df = df
        self.transform = transform
        self.labels = sorted(df['Label'].unique())
        self.label_map = {label: idx for idx, label in enumerate(self.labels)}

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        img_path = self.df.Filepath.iloc[idx]
        label = self.label_map[self.df.Label.iloc[idx]]
        img = cv2.imread(img_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        if self.transform:
            img = self.transform(img)
        return img, label

# 3. 数据增强
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

train_df, test_df = train_test_split(image_df, test_size=0.2, random_state=42)
train_df, val_df = train_test_split(train_df, test_size=0.2, random_state=42)

train_dataset = BirdDataset(train_df, transform=train_transforms)
val_dataset = BirdDataset(val_df, transform=val_transforms)
test_dataset = BirdDataset(test_df, transform=val_transforms)

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False)

# 4. 模型
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = models.efficientnet_b0(pretrained=True)

# 冻结预训练权重
for param in model.parameters():
    param.requires_grad = False

# 替换分类层
model.classifier = nn.Sequential(
    nn.Linear(model.classifier[1].in_features, 128),
    nn.ReLU(),
    nn.Dropout(0.45),
    nn.Linear(128, 256),
    nn.ReLU(),
    nn.Dropout(0.45),
    nn.Linear(256, NUM_CLASSES)
)
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.classifier.parameters(), lr=1e-4)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, factor=0.2, patience=3, min_lr=1e-6)


# 5. 训练函数
model_save_dir = "model"
os.makedirs(model_save_dir, exist_ok=True)
def train_model(model, train_loader, val_loader, epochs=50, patience=5):
    best_val_acc = 0.0
    history = {'train_loss': [], 'train_acc': [], 'val_loss': [], 'val_acc': []}
    early_stop_counter = 0

    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        running_corrects = 0
        total = 0

        loop = tqdm(train_loader, leave=True)
        for inputs, labels in loop:
            inputs, labels = inputs.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            _, preds = torch.max(outputs, 1)
            running_loss += loss.item() * inputs.size(0)
            running_corrects += torch.sum(preds == labels.data).item()
            total += inputs.size(0)

            # 格式化为普通浮点数，避免显示 tensor(...)
            cur_loss = running_loss / total if total > 0 else 0.0
            cur_acc = (running_corrects / total) if total > 0 else 0.0
            loop.set_description(f"Epoch [{epoch+1}/{epochs}]")
            loop.set_postfix(loss=f"{cur_loss:.4f}", acc=f"{cur_acc:.4f}")

        # 训练结束计算 epoch 平均值（确保为 float）
        train_loss = running_loss / total
        train_acc = running_corrects / total

        # Validation
        model.eval()
        val_loss = 0.0
        val_corrects = 0
        total_val = 0
        with torch.no_grad():
            for inputs, labels in val_loader:
                inputs, labels = inputs.to(device), labels.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, labels)
                _, preds = torch.max(outputs, 1)
                val_loss += loss.item() * inputs.size(0)
                val_corrects += torch.sum(preds == labels.data).item()
                total_val += inputs.size(0)

        val_loss = val_loss / total_val if total_val > 0 else 0.0
        val_acc = val_corrects / total_val if total_val > 0 else 0.0

        # 学习率调度器（按 val_loss）
        scheduler.step(val_loss)

        # 把纯 Python float 存入 history
        history['train_loss'].append(float(train_loss))
        history['train_acc'].append(float(train_acc))
        history['val_loss'].append(float(val_loss))
        history['val_acc'].append(float(val_acc))

        print(
            f"Epoch {epoch + 1}/{epochs} | "
            f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f}, Acc: {val_acc:.4f}"
        )

        # EarlyStopping & 保存最优模型
        if val_acc > best_val_acc:
            best_val_acc = float(val_acc)
            save_path = os.path.join(model_save_dir, f"epoch{epoch + 1}.pth")
            torch.save(model.state_dict(), save_path)
            early_stop_counter = 0
        else:
            early_stop_counter += 1
            if early_stop_counter >= patience:
                print("Early stopping triggered.")
                break

    return history

if __name__ == '__main__':
    history = train_model(model, train_loader, val_loader, epochs=50, patience=5)

    # 7. 绘制训练曲线
    plt.figure(figsize=(10, 5))
    plt.plot(history['train_acc'], label='Train Acc')
    plt.plot(history['val_acc'], label='Val Acc')
    plt.title('Accuracy')
    plt.legend()
    plt.show()

    plt.figure(figsize=(10, 5))
    plt.plot(history['train_loss'], label='Train Loss')
    plt.plot(history['val_loss'], label='Val Loss')
    plt.title('Loss')
    plt.legend()
    plt.show()

