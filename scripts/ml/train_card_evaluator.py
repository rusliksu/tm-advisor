#!/usr/bin/env python3
"""
Train XGBoost model to predict final VP from game state features.

Input:  data/features.csv (from prepare_features.py)
Output: models/card_evaluator.json (XGBoost model)

Usage:
  python scripts/ml/train_card_evaluator.py
  python scripts/ml/train_card_evaluator.py --target winner   # classify win/loss
  python scripts/ml/train_card_evaluator.py --target vp_rank  # predict rank (1-3)
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import cross_val_score, GroupKFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, accuracy_score
import xgboost as xgb


# Features to use for training (drop identifiers and labels)
DROP_COLS = [
    'game_id', 'player', 'corp', 'phase', 'action_type',
    'final_vp', 'winner', 'vp_rank',
]

# XGBoost hyperparams — reasonable defaults for tabular data
XGB_PARAMS_REG = {
    'n_estimators': 300,
    'max_depth': 6,
    'learning_rate': 0.05,
    'subsample': 0.8,
    'colsample_bytree': 0.8,
    'min_child_weight': 5,
    'reg_alpha': 0.1,
    'reg_lambda': 1.0,
    'random_state': 42,
    'n_jobs': -1,
}

XGB_PARAMS_CLF = {
    **XGB_PARAMS_REG,
    'eval_metric': 'logloss',
    'use_label_encoder': False,
}


def load_data(csv_path, target='final_vp'):
    """Load features CSV and split into X, y, groups."""
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    # Groups for GroupKFold — games should not leak across folds
    groups = df['game_id'].values

    y = df[target].values
    X = df.drop(columns=[c for c in DROP_COLS if c in df.columns], errors='ignore')

    # All features should be numeric at this point
    non_numeric = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric:
        print(f"  Dropping non-numeric columns: {non_numeric}")
        X = X.drop(columns=non_numeric)

    print(f"  Features: {X.shape[1]}, Target: {target}")
    print(f"  Target stats: mean={y.mean():.2f}, std={y.std():.2f}, "
          f"min={y.min()}, max={y.max()}")

    return X, y, groups, df


def train_regressor(X, y, groups):
    """Train XGBoost regressor with GroupKFold cross-validation."""
    model = xgb.XGBRegressor(**XGB_PARAMS_REG)

    # GroupKFold: ensure same game's data is always in same fold
    n_unique = len(set(groups))
    n_splits = min(5, n_unique)
    if n_splits < 2:
        print("Not enough games for cross-validation. Training on all data.")
        model.fit(X, y)
        return model, {}

    gkf = GroupKFold(n_splits=n_splits)

    # Manual cross-val to get MAE and RMSE
    maes, rmses = [], []
    for train_idx, val_idx in gkf.split(X, y, groups):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        m = xgb.XGBRegressor(**XGB_PARAMS_REG)
        m.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)

        pred = m.predict(X_val)
        maes.append(mean_absolute_error(y_val, pred))
        rmses.append(np.sqrt(mean_squared_error(y_val, pred)))

    metrics = {
        'cv_mae_mean': round(np.mean(maes), 2),
        'cv_mae_std': round(np.std(maes), 2),
        'cv_rmse_mean': round(np.mean(rmses), 2),
        'cv_rmse_std': round(np.std(rmses), 2),
        'n_folds': n_splits,
        'n_games': n_unique,
    }

    print(f"\nCross-validation ({n_splits}-fold, grouped by game):")
    print(f"  MAE:  {metrics['cv_mae_mean']:.2f} +/- {metrics['cv_mae_std']:.2f}")
    print(f"  RMSE: {metrics['cv_rmse_mean']:.2f} +/- {metrics['cv_rmse_std']:.2f}")

    # Train final model on all data
    model.fit(X, y)
    return model, metrics


def train_classifier(X, y, groups):
    """Train XGBoost classifier (for winner prediction)."""
    model = xgb.XGBClassifier(**XGB_PARAMS_CLF)

    n_unique = len(set(groups))
    n_splits = min(5, n_unique)
    if n_splits < 2:
        print("Not enough games for cross-validation. Training on all data.")
        model.fit(X, y)
        return model, {}

    gkf = GroupKFold(n_splits=n_splits)

    accs = []
    for train_idx, val_idx in gkf.split(X, y, groups):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        m = xgb.XGBClassifier(**XGB_PARAMS_CLF)
        m.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)

        pred = m.predict(X_val)
        accs.append(accuracy_score(y_val, pred))

    metrics = {
        'cv_accuracy_mean': round(np.mean(accs), 4),
        'cv_accuracy_std': round(np.std(accs), 4),
        'n_folds': n_splits,
        'n_games': n_unique,
        'positive_rate': round(y.mean(), 4),
    }

    print(f"\nCross-validation ({n_splits}-fold, grouped by game):")
    print(f"  Accuracy: {metrics['cv_accuracy_mean']:.4f} +/- {metrics['cv_accuracy_std']:.4f}")
    print(f"  Baseline (always predict majority): {1 - metrics['positive_rate']:.4f}")

    model.fit(X, y)
    return model, metrics


def show_feature_importance(model, feature_names, top_n=20):
    """Print top features by importance."""
    importances = model.feature_importances_
    indices = np.argsort(importances)[::-1][:top_n]

    print(f"\nTop {top_n} features:")
    for rank, idx in enumerate(indices, 1):
        print(f"  {rank:2d}. {feature_names[idx]:25s} {importances[idx]:.4f}")


def main():
    parser = argparse.ArgumentParser(description='Train TM card evaluator model')
    parser.add_argument('--input', type=str, default=None,
                        help='Path to features.csv')
    parser.add_argument('--target', type=str, default='final_vp',
                        choices=['final_vp', 'winner', 'vp_rank'],
                        help='Target variable (default: final_vp)')
    parser.add_argument('--output', type=str, default=None,
                        help='Path to save model JSON')
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[2]

    csv_path = Path(args.input) if args.input else project_root / 'data' / 'features.csv'
    model_path = Path(args.output) if args.output else project_root / 'models' / 'card_evaluator.json'

    if not csv_path.exists():
        print(f"Features file not found: {csv_path}")
        print("Run prepare_features.py first:")
        print("  python scripts/ml/prepare_features.py")
        sys.exit(1)

    X, y, groups, df = load_data(csv_path, target=args.target)

    # Choose regressor or classifier
    if args.target == 'winner':
        model, metrics = train_classifier(X, y, groups)
    else:
        model, metrics = train_regressor(X, y, groups)

    show_feature_importance(model, X.columns.tolist())

    # Save model
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(model_path))

    # Save metadata alongside model
    meta_path = model_path.with_suffix('.meta.json')
    meta = {
        'target': args.target,
        'features': X.columns.tolist(),
        'n_samples': len(X),
        'n_games': len(set(groups)),
        'metrics': metrics,
        'xgb_params': XGB_PARAMS_REG if args.target != 'winner' else XGB_PARAMS_CLF,
    }
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)

    print(f"\nModel saved to {model_path}")
    print(f"Metadata saved to {meta_path}")

    # Quick sanity check: predict on training data
    train_pred = model.predict(X)
    if args.target == 'winner':
        print(f"\nTrain accuracy: {accuracy_score(y, train_pred):.4f}")
    else:
        print(f"\nTrain MAE: {mean_absolute_error(y, train_pred):.2f}")
        print(f"Train RMSE: {np.sqrt(mean_squared_error(y, train_pred)):.2f}")

        # Show prediction distribution
        print(f"\nPredictions: mean={train_pred.mean():.1f}, "
              f"std={train_pred.std():.1f}, "
              f"min={train_pred.min():.1f}, max={train_pred.max():.1f}")


if __name__ == '__main__':
    main()
