import json
import os
from torchvision.datasets import ImageFolder
from torchvision import transforms

# 数据集路径
dataset_path = "dataset/train"

# 检查路径是否存在
if not os.path.exists(dataset_path):
    raise FileNotFoundError(f"Dataset path not found: {dataset_path}")

# 加载数据集
dataset = ImageFolder(dataset_path, transform=transforms.ToTensor())
class_to_idx = dataset.class_to_idx

# 反转为 idx_to_label，确保 JSON 中索引是字符串
idx_to_label = {str(idx): label for label, idx in class_to_idx.items()}

# 输出 JSON 文件
output_path = "../models/class_to_label.json"
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(idx_to_label, f, ensure_ascii=False, indent=2)

print(f"class_to_label.json exported to {output_path}")
