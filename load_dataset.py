'''
import requests
url = "https://raw.githubusercontent.com/mrdbourke/tensorflow-deep-learning/main/extras/helper_functions.py"
r = requests.get(url)
with open("helper_functions.py", "wb") as f:
    f.write(r.content)
'''

import os
from datasets import load_dataset
from PIL import Image
import tqdm

# 'default' config 通常包含所有分割
dataset = load_dataset("yashikota/birds-525-species-image-classification")
dataset.save_to_disk("dataset_from_huggingface")
