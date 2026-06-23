# backend/app/ml/train_qna.py
import os, json, pandas as pd
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from joblib import dump

BASE_DIR = os.path.dirname(__file__)
DATASET_PATH = os.path.abspath(os.path.join(BASE_DIR, "../../data/qna_dataset.csv"))
MODEL_PATH   = os.path.abspath(os.path.join(BASE_DIR, "../../models/qna_clf.joblib"))
REPORT_PATH  = os.path.abspath(os.path.join(BASE_DIR, "../../models/last_train_report.json"))

def make_pair_text(df: pd.DataFrame) -> pd.Series:
    q = df["question"].fillna("")
    c = df["chunk"].fillna("")
    return q + " [SEP] " + c

def main():
    import sys, time, os

    df_raw = pd.read_csv(DATASET_PATH)
    print("=== DATASET DEBUG ===")
    print("DATASET_PATH:", DATASET_PATH)
    print("rows_raw:", len(df_raw)); sys.stdout.flush()

    # 1) dropna
    df1 = df_raw.dropna(subset=["question","chunk","label"])
    print("rows_dropna:", len(df1)); sys.stdout.flush()

    # 2) drop duplicates (question+chunk+label)
    df2 = df1.drop_duplicates(subset=["question","chunk","label"])
    print("rows_nodup:", len(df2)); sys.stdout.flush()

    # 3) remove empty strings
    df3 = df2[
        (df2["question"].astype(str).str.strip()!="") &
        (df2["chunk"].astype(str).str.strip()!="")
    ]
    print("rows_notempty:", len(df3)); sys.stdout.flush()

    # 4) length bounds
    lens = df3["chunk"].astype(str).str.len()
    df  = df3[(lens >= 5) & (lens <= 4000)]
    print("rows_len5_4000:", len(df)); sys.stdout.flush()

    # Sauvegarde du dataset utilisé réellement
    DEBUG_CLEAN_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../models/debug_last_cleaned.csv"))
    os.makedirs(os.path.dirname(DEBUG_CLEAN_PATH), exist_ok=True)
    df.to_csv(DEBUG_CLEAN_PATH, index=False)
    print("cleaned_saved_to:", DEBUG_CLEAN_PATH)
    print("=== END DATASET DEBUG ==="); sys.stdout.flush()

    # --- suite de ton pipeline d'entraînement, cette fois sur df ---
    X = make_pair_text(df)
    y = df["label"].astype(int)

    # ... (rien d'autre à changer dans le reste du script)


    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, stratify=y, random_state=123)

    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1)
    pipe = Pipeline([
        ("tfidf", vec),
        ("clf", LogisticRegression(max_iter=3000, class_weight="balanced")),
    ])

    # --- Grid Search ---
    USE_GRID_SEARCH = True

    if USE_GRID_SEARCH:
        from sklearn.model_selection import GridSearchCV, StratifiedKFold

        base_pipe = Pipeline([
            ("tfidf", TfidfVectorizer(analyzer="char_wb")),
            ("clf", LogisticRegression(max_iter=3000, class_weight="balanced", solver="lbfgs")),
        ])

        param_grid = {
            "tfidf__ngram_range": [(3,5), (3,6)],
            "tfidf__min_df": [1, 2, 3],
            "clf__C": [0.5, 1.0, 2.0, 4.0],
        }

        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        gs = GridSearchCV(
            base_pipe, param_grid,
            scoring="f1_macro", cv=cv, n_jobs=-1, verbose=1
        )
        gs.fit(Xtr, ytr)
        pipe = gs.best_estimator_  # ← on remplace le pipe par le meilleur

        # On mémorise le résultat de la CV dans le rapport final
        grid_block = {
            "best_params": gs.best_params_,
            "cv_best_score_f1_macro": float(gs.best_score_),
        }
    else:
        grid_block = None

    pipe.fit(Xtr, ytr)
    yhat = pipe.predict(Xte)
    yproba = pipe.predict_proba(Xte)[:, 1]  
    report_dict = classification_report(yte, yhat, output_dict=True, digits=2)

    from sklearn.metrics import (
        classification_report, confusion_matrix,
        roc_auc_score, average_precision_score
    )
    # Indicateurs complémentaires
    cm   = confusion_matrix(yte, yhat).tolist()
    roc  = roc_auc_score(yte, yproba)
    ap   = average_precision_score(yte, yproba)


    # ENSEMBLES (OFF par défaut)
    USE_ENSEMBLE = False
    USE_ENSEMBLE_AS_DEFAULT = False  # si True et si meilleur → remplacera pipe

    rep_ens = None
    roc_ens = None
    ap_ens  = None
    pipe_ens = None

    if USE_ENSEMBLE:
        from sklearn.ensemble import VotingClassifier
        from sklearn.svm import LinearSVC
        from sklearn.calibration import CalibratedClassifierCV

        vec_ens = TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1)
        voter = VotingClassifier(
            estimators=[
                ("lr", LogisticRegression(max_iter=3000, class_weight="balanced", solver="lbfgs")),
                ("svm", CalibratedClassifierCV(LinearSVC(), cv=3)),
            ],
            voting="soft"
        )
        pipe_ens = Pipeline([("tfidf", vec_ens), ("clf", voter)])
        pipe_ens.fit(Xtr, ytr)

        yhat_ens = pipe_ens.predict(Xte)
        rep_ens  = classification_report(yte, yhat_ens, output_dict=True, digits=2)

        try:
            yproba_ens = pipe_ens.predict_proba(Xte)[:, 1]
            roc_ens = float(roc_auc_score(yte, yproba_ens))
            ap_ens  = float(average_precision_score(yte, yproba_ens))
        except Exception:
            roc_ens = None
            ap_ens  = None

        # Remplacement du modèle (optionnel)
        try:
            f1_base = report_dict["macro avg"]["f1-score"]
            f1_ens  = rep_ens["macro avg"]["f1-score"]
            if USE_ENSEMBLE_AS_DEFAULT and f1_ens >= f1_base:
                pipe = pipe_ens
                chosen_model = "ensemble_soft_voting"
            else:
                chosen_model = "logreg"
        except Exception:
            chosen_model = "logreg"
    else:
        chosen_model = "logreg"

    # REECHANTILLONNAGE (OFF par défaut)
    USE_RESAMPLING = False
    rep_imb = None
    roc_imb = None
    ap_imb  = None

    if USE_RESAMPLING:
        try:
            from imblearn.over_sampling import RandomOverSampler
            from imblearn.pipeline import Pipeline as ImbPipeline

            imb_pipe = ImbPipeline([
                ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5), min_df=1)),
                ("ros", RandomOverSampler(random_state=42)),
                ("clf", LogisticRegression(max_iter=3000, solver="lbfgs")),  # sans class_weight
            ])
            imb_pipe.fit(Xtr, ytr)
            yhat_imb = imb_pipe.predict(Xte)
            rep_imb  = classification_report(yte, yhat_imb, output_dict=True, digits=2)

            try:
                yproba_imb = imb_pipe.predict_proba(Xte)[:, 1]
                roc_imb = float(roc_auc_score(yte, yproba_imb))
                ap_imb  = float(average_precision_score(yte, yproba_imb))
            except Exception:
                roc_imb = None
                ap_imb  = None
        except ImportError:
            pass
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    dump(pipe, MODEL_PATH)

    payload = {
    "status": "ok",
    "trained_at": datetime.now().isoformat(timespec="seconds"),
    "dataset_path": DATASET_PATH,
    "dataset_rows": int(len(df)),
    "model_path": MODEL_PATH,
    "metrics": report_dict,
    "grid_search": grid_block,
    "extra_metrics": {
        "confusion_matrix": cm,         # [[tn, fp],[fn, tp]]
        "roc_auc": float(roc),
        "average_precision": float(ap)
    }
    }

    # Sauvegarder un fichier rapport persistant (utile pour relecture)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # Et imprimer en JSON pour que la route /admin/retrain le capture
    print("===BT_REPORT_START===")
    print(json.dumps(payload, ensure_ascii=False))
    print("===BT_REPORT_END===")


# from sklearn.svm import LinearSVC
# from sklearn.calibration import CalibratedClassifierCV
# from sklearn.metrics import classification_report, roc_auc_score, average_precision_score

# df = pd.read_csv(DATASET_PATH).dropna(subset=["question","chunk","label"])
# X = df["question"] + " [SEP] " + df["chunk"]
# y = df["label"].astype(int)

# Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

# def evaluate_model(pipe, Xte, yte, proba=True, name="model"):
#     yhat = pipe.predict(Xte)
#     rep  = classification_report(yte, yhat, output_dict=True, digits=2)
#     out  = {"name": name, "cls_report": rep}
#     if proba:
#         yproba = pipe.predict_proba(Xte)[:,1]
#         out["roc_auc"] = float(roc_auc_score(yte, yproba))
#         out["avg_prec"] = float(average_precision_score(yte, yproba))
#     return out

# # LogReg
# pipe_lr = Pipeline([
#     ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5))),
#     ("clf", LogisticRegression(max_iter=3000, class_weight="balanced"))
# ]).fit(Xtr, ytr)

# pipe_svm = Pipeline([
#     ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3,5))),
#     ("clf", CalibratedClassifierCV(LinearSVC(), cv=3))
# ]).fit(Xtr, ytr)

# res_lr  = evaluate_model(pipe_lr,  Xte, yte, proba=True,  name="LogReg")
# res_svm = evaluate_model(pipe_svm, Xte, yte, proba=True,  name="LinearSVC(cal)")
# print(res_lr)
# print(res_svm)

if __name__ == "__main__":
    main()
