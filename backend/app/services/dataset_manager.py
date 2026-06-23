import os, pandas as pd

DATASET_PATH = os.path.join(os.path.dirname(__file__), "../../data/qna_dataset.csv")

def add_training_example(question: str, chunk: str, label: int):
    if not os.path.exists(DATASET_PATH):
        df = pd.DataFrame(columns=["question", "chunk", "label"])
    else:
        df = pd.read_csv(DATASET_PATH)

    new_row = {"question": question, "chunk": chunk, "label": label}
    df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
    df.to_csv(DATASET_PATH, index=False)
    return True
