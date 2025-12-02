from datasets import load_from_disk
from PIL import Image
from tqdm import tqdm
import os

# 1. 读取从 Hugging Face 下载的 .arrow 数据集（用 save_to_disk() 保存过的）
dataset = load_from_disk("dataset_from_huggingface")

# 2. 导出 train、test、validation 三个 split（有哪个就导哪个）
for split in dataset.keys():
    split_dir = f"dataset/{split}"
    os.makedirs(split_dir, exist_ok=True)

    print(f"\n开始导出 {split} split，共 {len(dataset[split])} 张图片...")
    label_info = dataset[split].features["label"]

    # tqdm 进度条包裹数据迭代
    for i, item in enumerate(tqdm(dataset[split], total=len(dataset[split]), desc=f"{split}")):
        # 取标签名（不是数字 ID，而是对应的类别字符串）
        label_name = label_info.int2str(item["label"])
        label_dir = os.path.join(split_dir, label_name)
        os.makedirs(label_dir, exist_ok=True)

        # 保存图片
        img_path = os.path.join(label_dir, f"{i}.jpg")
        item["image"].save(img_path)


