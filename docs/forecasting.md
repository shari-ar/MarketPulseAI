# Swing Forecasting Methodology

## Objective

- **Forecasted metric:** Tomorrow's swing percent, defined as `(tomorrowHigh - todayPrimeCost) * 100 / todayPrimeCost`.
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

- **Architecture:** Temporal Convolutional Network (TCN) with residual 1D convolution blocks over the seven-day sequences, followed by a dense regression head. This architecture excels at short, fixed-length sequences and preserves temporal ordering without recurrence overhead.
- **Why TCN:** Strong performance on noisy financial series, low inference latency in TensorFlow.js, and straightforward conversion from Python/Keras training artifacts to the browser bundle.
- **Output:** A single scalar representing the predicted swing percent for the next trading day.

## Training Pipeline

1. **Dataset construction:** Build sliding windows of seven consecutive days per symbol from historical `topBoxSnapshots`; the label for each window is the swing percent computed from day eight (`tomorrowHigh`, `todayPrimeCost`).
2. **Splits:** Time-based split (e.g., 70/15/15 for train/validation/test) to prevent leakage across periods or symbols.
3. **Preprocessing:** Sort by `dateTime`, compute engineered features, apply Z-score scaling per feature using training-set statistics, and persist those scalers alongside the model.
4. **Loss and optimization:** Huber loss to dampen outliers, Adam optimizer with learning-rate decay, and early stopping on validation MAE.
5. **Evaluation:** Report MAE and MAPE on the swing percent target, plus directional accuracy (sign of swing) to gauge ranking robustness.
6. **Export:** Convert the trained Keras model to TensorFlow.js format using `tensorflowjs_converter`, bundling both the model JSON and weight shards for the extension.

## Inference Workflow

1. **Eligibility check:** Require at least seven recent snapshots after retention pruning; otherwise skip forecasting for that symbol.
2. **Window assembly:** Pull the last seven `topBoxSnapshots` rows, order by `dateTime`, and rebuild engineered features using the stored scalers.
3. **TensorFlow.js scoring:** Load the TCN assets in the analysis worker, run a single forward pass, and write the resulting value to `predictedSwingPercent` on the most recent row.
4. **Ranking:** The popup orders symbols by `predictedSwingPercent`, highlights the top five by default, and propagates the score into exports.

## Operational Guardrails

- **Data freshness:** Retention sweeps must keep at least seven consecutive days for each symbol to avoid dropped forecasts.
- **Fallbacks:** If the model assets fail to load, skip inference and keep `predictedSwingPercent` null to avoid stale scores.
- **Monitoring:** Log TensorFlow.js load times and inference durations in the worker console to detect regressions before release.
