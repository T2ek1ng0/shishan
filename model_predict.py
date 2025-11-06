import torch, os, sys, json
from torchvision import models, transforms
from PIL import Image

TARGET_SIZE = (224, 224)

# 加载模型和标签
def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

label_map_path = resource_path('class_to_label.json')
model_path = resource_path('my_model.pth')

with open(label_map_path, 'r', encoding='utf-8') as f:
    idx_to_label = json.load(f)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

num_classes = 525
model = models.resnet50(pretrained=False)
in_features = model.fc.in_features
model.fc = torch.nn.Sequential(
    torch.nn.Linear(in_features, 256),
    torch.nn.ReLU(),
    torch.nn.Dropout(0.4),
    torch.nn.Linear(256, num_classes)
)

model.load_state_dict(torch.load(model_path, map_location=device))
model.to(device)
model.eval()

transform = transforms.Compose([
    transforms.Resize(TARGET_SIZE),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])
])

print("MODEL_READY", flush=True)
# 循环等待 Electron 发送图片路径
for line in sys.stdin:
    image_path = line.strip()
    if not os.path.exists(image_path):
        print("ERROR: File not found", flush=True)
        continue
    try:
        image = Image.open(image_path).convert("RGB")
        image_tensor = transform(image).unsqueeze(0).to(device)
        with torch.no_grad():
            outputs = model(image_tensor)
            _, predicted = torch.max(outputs, 1)
        label = idx_to_label[str(predicted.item())]
        print(label, flush=True)
    except Exception as e:
        print(f"ERROR: {e}", flush=True)

