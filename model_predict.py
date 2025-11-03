import torch
import os
import sys
from torchvision import transforms, models
from PIL import Image
from torchvision.datasets import ImageFolder
import torch.nn as nn

TARGET_SIZE = (224, 224)

# 从命令行获取图片路径
if len(sys.argv) < 2:
    print("Usage: python classify.py <image_path>")
    sys.exit(1)

def resource_path(relative_path):
    """获取资源的绝对路径；支持 PyInstaller 或 Electron asar 打包方式"""
    try:
        # Electron 打包后会把 Python 脚本放在 resources 目录下
        base_path = sys._MEIPASS
    except Exception:
        # 开发环境下的脚本目录
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

image_path = sys.argv[1]
dataset_path = resource_path('dataset/train')
ckpt_dir = resource_path('model_resnet50')
if not os.path.exists(dataset_path):
    print(f"Dataset directory not found: {dataset_path}")
    sys.exit(1)

if not os.path.exists(ckpt_dir):
    print(f"Model directory not found: {ckpt_dir}")
    sys.exit(1)

# 1. 准备标签映射
train_dataset = ImageFolder(dataset_path, transform=transforms.ToTensor())
idx_to_label = {v: k for k, v in train_dataset.class_to_idx.items()}

# 2. 设置设备
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 3. 定义模型并加载权重
num_classes = 525
model = models.resnet50(pretrained=False)
in_features = model.fc.in_features
model.fc = nn.Sequential(
    nn.Linear(in_features, 256),
    nn.ReLU(),
    nn.Dropout(0.4),
    nn.Linear(256, num_classes)
)

pth_files = [f for f in os.listdir(ckpt_dir) if f.endswith(".pth")]
latest_ckpt = max(pth_files, key=lambda f: os.path.getmtime(os.path.join(ckpt_dir, f)))
model.load_state_dict(torch.load(os.path.join(ckpt_dir, latest_ckpt), map_location=device))
model.to(device)
model.eval()

transform = transforms.Compose([
    transforms.Resize(TARGET_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])

image = Image.open(image_path).convert("RGB")
image_tensor = transform(image).unsqueeze(0).to(device)

with torch.no_grad():
    outputs = model(image_tensor)
    _, predicted = torch.max(outputs, 1)

label = idx_to_label[predicted.item()]
print(label)
