import { Ticker } from './ticker.types';

enum BarDirection {
    BUY = 'buy',
    SELL = 'sell',
}

export interface VolumeBar {
    _id: string;
    ticker: Ticker;
    barDirection: BarDirection;
    price: number;
    priceDateTime: Date;
    values: Record<string, any>;
    imageName: string;
    createdAt: Date;
    updatedAt: Date;
}
