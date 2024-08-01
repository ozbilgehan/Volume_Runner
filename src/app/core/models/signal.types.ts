import { VolumeBar } from './volume-bar.types';

export enum SignalResult {
    NONE = 'none',
    BUY = 'buy',
    SELL = 'sell',
    BOTH = 'both'
}

export interface Signal {
    _id: string;
    volumeBar: VolumeBar;
    strategy_1: SignalResult;
    strategy_2: SignalResult;
    strategy_3: SignalResult;
    strategy_4: SignalResult;
    messageSendAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

// Function to determine the signal type
export function getSignalType(signal: Signal): SignalResult {
    const strategies = [signal.strategy_1, signal.strategy_2, signal.strategy_3, signal.strategy_4];

    // Check if there are both 'buy' and 'sell' strategies
    const hasBuy = strategies.some(strategy => strategy === SignalResult.BUY);
    const hasSell = strategies.some(strategy => strategy === SignalResult.SELL);

    if (hasBuy && !hasSell) {
        return SignalResult.BUY;
    } else if (!hasBuy && hasSell) {
        return SignalResult.SELL;
    } else {
        return SignalResult.BOTH; // Both buy and sell or neither are present
    }
}
