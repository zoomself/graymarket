"use client";

interface DisclaimerBannerProps {
  onAcknowledge?: () => void;
  acknowledged?: boolean;
  blocking?: boolean;
}

export function DisclaimerBanner({
  onAcknowledge,
  acknowledged = true,
  blocking = false,
}: DisclaimerBannerProps) {
  if (acknowledged) {
    return (
      <div className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs leading-relaxed text-amber-100/80">
        本榜单暗盘资金非官方统计，为量化模型估算值。A
        股无合规暗盘交易市场，指标存在局限性，不构成任何投资建议。投资有风险，请理性决策。
      </div>
    );
  }

  if (!blocking) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-sm text-zinc-200">
        <h2 className="mb-2 text-base font-semibold text-white">免责声明</h2>
        <p className="mb-2 leading-relaxed text-zinc-300">
          暗盘资金榜单内容依托公开市场行情、历史交易数据，通过量化算法模型测算生成。A
          股无官方暗盘交易场所，榜单所称暗盘仅为资金行为统计口径，区别于港股券商暗盘。
        </p>
        <p className="mb-4 leading-relaxed text-zinc-400">
          该内容仅为市场数据参考，不代表任何形式的投资建议或个股标的推荐。
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="rounded-lg bg-[#FF5500] px-6 py-2.5 font-medium text-white hover:bg-[#e64d00]"
        >
          我已知晓
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="relative z-[101] max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-sm text-zinc-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
      >
        <h2 id="disclaimer-title" className="mb-3 text-lg font-semibold text-white">
          免责声明
        </h2>
        <p className="mb-2 leading-relaxed text-zinc-300">
          暗盘资金榜单内容依托公开市场行情、历史交易数据，通过量化算法模型测算生成。A
          股无官方暗盘交易场所，榜单所称暗盘仅为资金行为统计口径，区别于港股券商暗盘。
        </p>
        <p className="mb-4 leading-relaxed text-zinc-400">
          该内容仅为市场数据参考，不代表任何形式的投资建议或个股标的推荐。榜单测算数据不构成任何买入、卖出或持有的投资决策依据。
        </p>
        <button
          type="button"
          onClick={() => onAcknowledge?.()}
          className="w-full cursor-pointer rounded-lg bg-[#FF5500] py-2.5 font-medium text-white hover:bg-[#e64d00] active:bg-[#cc4400]"
        >
          我已知晓
        </button>
      </div>
    </div>
  );
}
