# Swing Forecasting Methodology

## Objective

- **Forecasted metrics:** Tomorrow's swing percent, defined as `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost`, plus a calibrated swing probability used for ranking confidence.
- **Target horizon:** One trading day ahead; predictions are attached to each symbol's most recent snapshot.
- **Window length:** Seven most recent trading days per symbol are required for a valid forecast.

## Feature Set

Each training example is built from the last seven snapshots per symbol. The raw columns are sourced from `topBoxSnapshots` and ordered by `dateTime` before aggregation:

- Price and range: `primeCost`, `open`, `close`, `high`, `low`, `allowedHigh`, `allowedLow`.
- Liquidity and activity: `tradingVolume`, `tradingValue`, `tradesCount`, `baseVolume`, `averageMonthlyVolume`.
- Order flow mix: `naturalBuyVolume`, `naturalSellVolume`, `juridicalBuyVolume`, `juridicalSellVolume`, `totalBuyVolume`, `totalSellVolume`, plus their corresponding counts.
- Supply and float: `marketValue`, `shareCount`, `floatingShares`.

Engineered features add stability and capture short-term momentum:

- Day-over-day returns for `close` and `primeCost`.
- Intraday range ratios such as `(high - low) / primeCost` and `(close - open) / primeCost`.
- Liquidity ratios such as `tradingVolume / averageMonthlyVolume` and `totalBuyVolume / totalSellVolume`.
- Ratios of natural-to-juridical participation for every flow metric, e.g., `naturalBuyVolume / juridicalBuyVolume`, `naturalSellVolume / juridicalSellVolume`, and their count analogs (`naturalBuyCount / juridicalBuyCount`, `naturalSellCount / juridicalSellCount`).
- Cross-ratios across all volume-related fields—including `tradingVolume`, `tradingValue`, `totalBuyVolume`, `totalSellVolume`, `naturalBuyVolume`, `naturalSellVolume`, `juridicalBuyVolume`, `juridicalSellVolume`, `baseVolume`, and `averageMonthlyVolume`—pairwise normalized as `x_i / x_j` to capture dominance among sources.
- Cross-ratios across all count-related fields—including `tradesCount`, `totalBuyCount`, `totalSellCount`, `naturalBuyCount`, `naturalSellCount`, `juridicalBuyCount`, and `juridicalSellCount`—computed pairwise as `x_i / x_j` to reveal shifts in trade initiation mix.
- Z-scored versions of the above within each seven-day window to normalize scale differences across symbols.

## Model Choice

- **Architecture:** Temporal Convolutional Network (TCN) with residual 1D convolution blocks over the seven-day sequences, followed by dual heads: a dense regression head for swing percent and a sigmoid head for swing probability. This architecture excels at short, fixed-length sequences and preserves temporal ordering without recurrence overhead.
- **Why TCN:** Strong performance on noisy financial series, low inference latency in TensorFlow.js, and straightforward conversion from Python/Keras training artifacts to the browser bundle.
- **Output:** Two values written to the latest snapshot: the predicted swing percent for the next trading day and the probability that the move will occur.

### Reference Hyperparameters

- Filters: 32 → 64 across two residual stacks (kernel size 3, dilations 1 then 2) with causal padding.
- Blocks: Two residual blocks per stack, each block using Conv1D → LayerNorm → ReLU → Dropout(0.1) → Conv1D → LayerNorm → ReLU and residual addition.
- Heads: Shared flatten → Dense(64, ReLU) → Dropout(0.1); regression head Dense(1), classification head Dense(1, sigmoid).
- Optimization: Adam (lr=1e-3 with cosine decay), batch size 128, up to 50 epochs with early stopping (patience 6) on validation MAE.
- Regularization: L2 weight decay (1e-4) on convolution and dense kernels.
- Implementation note: These values are the baseline; override via experiment configs but document deviations in release notes.

## Training Pipeline

1. **Dataset construction:** Build sliding windows of seven consecutive days per symbol from historical `topBoxSnapshots`; the label for each window is the swing percent computed from day eight (`tomorrowHigh`, `todayPrimeCost`).
2. **Splits:** Time-based split (e.g., 70/15/15 for train/validation/test) to prevent leakage across periods or symbols.
3. **Preprocessing:** Sort by `dateTime`, compute engineered features, apply Z-score scaling per feature using training-set statistics, and persist those scalers alongside the model.
4. **Loss and optimization:** Huber loss to dampen outliers, Adam optimizer with learning-rate decay, and early stopping on validation MAE.
5. **Evaluation:** Report MAE and MAPE on the swing percent target, plus directional accuracy (sign of swing) to gauge ranking robustness.
6. **Export:** Convert the trained Keras model to TensorFlow.js format using `tensorflowjs_converter`, bundling both the model JSON and weight shards for the extension.
7. **Calibration:** Fit Platt scaling on the validation fold for the probability head, storing the logistic parameters with the exported assets. Refit calibration whenever the core model is retrained.
8. **Data gaps:** If a seven-day window contains missing raw fields, drop the affected day and backfill with the most recent valid value inside the window; discard the window if fewer than seven valid days remain after backfilling.

## Inference Workflow

1. **Eligibility check:** Require at least seven recent snapshots after retention pruning; otherwise skip forecasting for that symbol.
2. **Window assembly:** Pull the last seven `topBoxSnapshots` rows, order by `dateTime`, and rebuild engineered features using the stored scalers.
3. **TensorFlow.js scoring:** Load the TCN assets in the analysis worker, run a single forward pass, and write the resulting values to `predictedSwingPercent` and `predictedSwingProbability` on the most recent row.
4. **Calibration application:** Apply the stored Platt scaling parameters to the raw probability head output before persistence.
5. **Post-processing:** Clip swing percent to [-50%, 50%] and swing probability to [0.01, 0.99]; round both to three decimals for display while storing full precision for exports.
6. **Ranking:** The popup orders symbols by `predictedSwingProbability` (with `predictedSwingPercent` shown alongside for magnitude), highlights the top five by default, and propagates both scores into exports.

## Operational Guardrails

- **Data freshness:** Retention sweeps must keep at least seven consecutive days for each symbol to avoid dropped forecasts.
- **Fallbacks:** If the model assets fail to load, skip inference and keep `predictedSwingPercent` and `predictedSwingProbability` null to avoid stale scores.
- **Monitoring:** Log TensorFlow.js load times and inference durations in the worker console to detect regressions before release.
- **Retraining cadence:** Refresh the model weekly using the most recent six months of data, with a hard freeze on data up to T-1 trading day for the run. Publish metrics and calibration plots with each refresh.
- **Artifact versioning:** Version artifacts as `swing-tcn-<yyyy-mm-dd>-v<N>`; store the TF.js folder, scaler metadata, and calibration params in the extension assets directory under `analysis/models/`. Keep the latest two versions for rollback and update the extension manifest to point to the active tag.
