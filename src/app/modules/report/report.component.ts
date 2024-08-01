import { CommonModule, NgClass } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { Signal, SignalResult, getSignalType } from 'app/core/models/signal.types';
import { Ticker } from 'app/core/models/ticker.types';
import { SignalService } from 'app/core/services/signal.service';
import { TickerService } from 'app/core/services/ticker.service';
import axios from 'axios';
import { CrosshairMode, ISeriesApi, SeriesMarker, Time, UTCTimestamp, createChart } from 'lightweight-charts';
import { values } from 'lodash';
import { CookieService } from 'ngx-cookie-service';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'report',
    templateUrl: './report.component.html',
    styleUrls: ['./report.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [
        CommonModule,
        MatIconModule,
        MatButtonModule,
        MatRippleModule,
        MatMenuModule,
        MatButtonToggleModule,
        MatTableModule,
        NgClass,
        MatCheckboxModule,
    ],
    providers: [CookieService]
})
export class ReportComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('chart') chartElementRef!: ElementRef;
    @ViewChild('chartContainer') chartContainerElementRef!: ElementRef;
    @ViewChild('toolTip') toolTipElementRef!: ElementRef;

    chart: any;
    candlestickSeries!: ISeriesApi<'Candlestick'>;
    lineSeriesArray: ISeriesApi<'Line'>[] = [];
    currentCandle: any = null;

    webSocket;

    tickers: any;
    selectedTicker: Ticker; // Currently selected ticker
    private _unsubscribeAll: Subject<any> = new Subject<any>(); // Subject for unsubscribing from observables

    SignalResult = SignalResult;
    signalDetailColumns = ['barDirection', 'barPrice', 'barDatetime', 'barValues', 'strategy_1', 'strategy_2', 'strategy_3', 'strategy_4'];
    signals: Signal[] = [];
    markedSignal: Signal = null;

    isTrapOnlySignal = false;

    intervals = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']; // Available intervals for chart
    selectedInterval: string = '15m'; // Default selected interval
    selectedPeriod = 7; // Default selected period
    selectedLineCount = 0;

    endDate = Date.now(); // End time for historical data (current time)
    startDate = this.endDate - this.selectedPeriod * 24 * 60 * 60 * 1000; // Start time for historical data

    /**
     * Constructor
     */
    constructor(
        private _tickerService: TickerService,
        private _signalService: SignalService,
        private _cookieService: CookieService,
        private _changeDetectorRef: ChangeDetectorRef
    ) {
        // Retrieve selected ticker from cookie, if available
        const cookieTickerValue = this._cookieService.get('selectedTicker');
        if (cookieTickerValue) {
            this.selectedTicker = JSON.parse(cookieTickerValue) as Ticker;
        }

        // Retrieve selected interval from cookie, if available
        const cookieIntervalValue = this._cookieService.get('selectedInterval');
        if (cookieIntervalValue) {
            this.selectedInterval = cookieIntervalValue as string;
        }

        // Retrieve selected period from cookie, if available
        const cookiePeriodValue = this._cookieService.get('selectedPeriod');
        if (cookiePeriodValue) {
            this.selectedPeriod = cookiePeriodValue as unknown as number;
            this._setStartDate();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Get the ticker list
        this._tickerService.tickers$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((tickers) => {
                // Store the ticker list
                this.tickers = tickers;

                // Select the first ticker if none is selected and tickers array is not empty
                if (this.selectedTicker == undefined && tickers.length != 0)
                    this.selectedTicker = this.tickers[0];
            });
    }

    ngAfterViewInit(): void {
        this._initChart();
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }

    /**
     * Handler for ticker selection change
     * @param ticker - Selected ticker
     * Sets the selected ticker and stores it in a cookie
     */
    onTickerChanged(ticker: Ticker): void {
        this.selectedTicker = ticker;
        this._cookieService.set('selectedTicker', JSON.stringify(ticker));
        this.isTrapOnlySignal = false;
        this._setChartData();
    }

    /**
     * Handler for interval selection change
     * @param interval - Selected interval
     * Sets the selected interval and stores it in a cookie
     */
    onIntervalChanged(interval: string): void {
        this.selectedInterval = interval;
        this._cookieService.set('selectedInterval', interval);
        this._setChartData();
    }

    /**
     * Handler for period selection change
     * @param period - Selected period
     * Sets the selected period and stores it in a cookie
     */
    onPeriodChanged(period: number): void {
        this.selectedPeriod = period;
        this._cookieService.set('selectedPeriod', period as unknown as string);
        this._setStartDate();
        this._setChartData();
    }

    onLineCountChanged(count: number): void {
        this.selectedLineCount = count;
        this.lineSeriesArray.slice().reverse().forEach((lineSeries, index) => {
            lineSeries.applyOptions({ lineVisible: (this.selectedLineCount > index) });
        });
    }

    getSignalIcon(signalResult: SignalResult): string {
        return signalResult === SignalResult.BUY ? 'up' : 'down';
    }

    getSignalIconColor(signalResult: SignalResult): string {
        return signalResult === SignalResult.BUY ? 'green' : 'red';
    }

    onTrapOnlySignalChange(checked: boolean) {
        this.isTrapOnlySignal = checked;
        const filteredSignal = this.filteredSignalsByTraps();
        this._setMarkers(filteredSignal);

        this._clearLines();
        filteredSignal.forEach(signal => {
            const signalResult = getSignalType(signal);
            const lineSeries = this.chart.addLineSeries({
                lineVisible: false,
                lineWidth: 2,
                lineStyle: 0,
                lineType: 0,
                priceLineVisible: false,
                lastValueVisible: false,
                color: signalResult === SignalResult.BUY ? '#4682B4' : (signalResult === SignalResult.SELL ? '#f44336' : 'yellow')
            });

            lineSeries.setData([
                { time: new Date(signal.volumeBar.priceDateTime).getTime() / 1000 as UTCTimestamp, value: signal.volumeBar.price },
                { time: new Date(this.endDate).getTime() / 1000 as UTCTimestamp, value: signal.volumeBar.price }
            ])

            this.lineSeriesArray.push(lineSeries);
        });

        this.selectedLineCount = 0;
    }

    filteredSignalsByTraps() {
        if (this.isTrapOnlySignal) {
            const trapSignals = this.signals.filter(signal => { return signal.strategy_2 != SignalResult.NONE });
            return trapSignals;
        } else {
            return this.signals;
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Initializes the chart using Lightweight Charts library
     * Sets up chart options and series
     */
    private async _initChart(): Promise<void> {
        const chartElement = this.chartElementRef.nativeElement;

        this.chart = createChart(chartElement, {
            width: this.chartContainerElementRef.nativeElement.offsetWidth,
            height: this.chartContainerElementRef.nativeElement.offsetHeight,
            layout: {
                background: { color: 'rgb(30, 41, 59)' },
                textColor: '#C3BCDB',
            },
            grid: {
                vertLines: { color: '#444' },
                horzLines: { color: '#444' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#cccccc',
            },
            timeScale: {
                borderColor: '#71649C',
                timeVisible: true, // Ensure time is visible on the time scale
                secondsVisible: true, // Ensure seconds are visible on the time scale
            }
        });

        // Apply watermark to the chart
        this.chart.applyOptions({
            watermark: {
                visible: true,
                fontSize: 150,
                horzAlign: 'center',
                vertAlign: 'center',
                color: 'rgba(171, 71, 188, 0.1)',
                text: 'VolRun',
            },
        });

        // Add candlestick series to the chart
        this.candlestickSeries = this.chart.addCandlestickSeries({
            wickUpColor: 'rgb(54, 116, 217)',
            upColor: 'rgb(54, 116, 217)',
            wickDownColor: 'rgb(225, 50, 85)',
            downColor: 'rgb(225, 50, 85)',
            borderVisible: false,
        });

        // Resize chart on window resize
        window.addEventListener('resize', () => {
            this.chart.resize(this.chartContainerElementRef.nativeElement.offsetWidth, this.chartContainerElementRef.nativeElement.offsetHeight);
        });

        // Set initial chart data
        this._setChartData();
    }

    /**
     * Fetches historical data for the selected ticker and interval from Binance API
     * @returns Promise containing historical data array
     */
    private async _setChartData(): Promise<void> {
        this._clearLines();

        // Fetch historical data
        const historicalData = await this._fetchHistoricalData();

        // Set the fetched data to the chart
        this.candlestickSeries.setData(historicalData);
        await this._getSignals();
        await this._setupTooltips();

        this.chart.timeScale().fitContent();
        this.chart.timeScale().scrollToPosition(1);

        this._connectWebSocket();
    }

    private _clearLines(): void {
        this.selectedLineCount = 0;
        // Loop through the array and remove each LineSeries from the chart
        this.lineSeriesArray.forEach(series => {
            // Remove data from the series (optional)
            series.setData([]);

            // Remove the series from the chart
            this.chart.removeSeries(series);
        });
        // Clear the array
        this.lineSeriesArray.length = 0;
    }

    /**
     * Sets markers (signals) on the chart for buy/sell signals
     * Uses SeriesMarker from Lightweight Charts library
     */
    private async _setMarkers(signals): Promise<void> {
        const markers = signals.map(signal => {
            const signalResult = getSignalType(signal);
            const marker: SeriesMarker<Time> = {
                time: new Date(signal.volumeBar.priceDateTime).getTime() / 1000 as UTCTimestamp,
                position: signalResult === SignalResult.BUY ? 'belowBar' : (signalResult === SignalResult.SELL ? 'aboveBar' : 'inBar'),
                color: signalResult === SignalResult.BUY ? '#2196F3' : (signalResult === SignalResult.SELL ? '#e91e63' : 'yellow'),
                shape: signalResult === SignalResult.BUY ? 'arrowUp' : (signalResult === SignalResult.SELL ? 'arrowDown' : 'circle'),
                text: signalResult === SignalResult.BUY ? 'Buy' : (signalResult === SignalResult.SELL ? 'Sell' : 'Buy&Sell'),
                id: signal._id
            };
            return marker;
        });

        this.candlestickSeries.setMarkers(markers);
    }

    private async _setupTooltips(): Promise<void> {
        this.chart.subscribeCrosshairMove((param) => {
            if (param.hoveredObjectId) {
                if (this.markedSignal === null) {
                    this.markedSignal = this.signals.find(signal => signal._id === param.hoveredObjectId);
                    this._changeDetectorRef.detectChanges();

                    let left = param.point.x + this.chartElementRef.nativeElement.offsetLeft - this.toolTipElementRef.nativeElement.offsetWidth - 5;
                    let top = param.point.y + this.chartElementRef.nativeElement.offsetTop - this.toolTipElementRef.nativeElement.offsetHeight - 5;

                    this.toolTipElementRef.nativeElement.style.left = left + 'px';
                    this.toolTipElementRef.nativeElement.style.top = top + 'px';
                }
            } else {
                this.markedSignal = null; // Ensure to reset markedSignal if no hoveredObjectId
                this._changeDetectorRef.detectChanges();
            }
        });
    }

    private async _fetchHistoricalData(): Promise<any[]> {
        const symbol = `${this.selectedTicker.name}USDT`;
        const interval = this.selectedInterval;

        let startDate = this.startDate;

        const limit = 500;
        const allData: any[] = [];

        while (true) {
            const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startDate}&endTime=${this.endDate}`;

            try {
                const response = await axios.get(url);
                const data = response.data.map((candle: any) => ({
                    time: candle[0] / 1000, // Convert to seconds
                    open: parseFloat(candle[1]), // Open price
                    high: parseFloat(candle[2]), // High price
                    low: parseFloat(candle[3]), // Low price
                    close: parseFloat(candle[4]), // Closing price
                }));

                allData.push(...data);

                if (data.length < limit) {
                    // Break the loop if less data is returned than the limit, meaning we've fetched all available data
                    break;
                }

                // Update startTime to the time of the last fetched candle + 1ms to avoid overlapping
                startDate = data[data.length - 1].time * 1000 + 1;
            } catch (error) {
                console.error('Error fetching historical data:', error);
                return [];
            }
        }

        return allData;
    }

    private async _getSignals(): Promise<void> {
        // Get the signal list
        this._signalService.getSignalsByTickerAndDateTime(this.selectedTicker, new Date(this.startDate), new Date(this.endDate))
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((signals) => {
                // Store the signal list
                this.signals = signals;
                this._setMarkers(signals);
                this._changeDetectorRef.detectChanges();

                this.signals.forEach(signal => {
                    const signalResult = getSignalType(signal);
                    const lineSeries = this.chart.addLineSeries({
                        lineVisible: false,
                        lineWidth: 2,
                        lineStyle: 0,
                        lineType: 0,
                        priceLineVisible: false,
                        lastValueVisible: false,
                        color: signalResult === SignalResult.BUY ? '#4682B4' : (signalResult === SignalResult.SELL ? '#f44336' : 'yellow')
                    });

                    lineSeries.setData([
                        { time: new Date(signal.volumeBar.priceDateTime).getTime() / 1000 as UTCTimestamp, value: signal.volumeBar.price },
                        { time: new Date(this.endDate).getTime() / 1000 as UTCTimestamp, value: signal.volumeBar.price }
                    ])

                    this.lineSeriesArray.push(lineSeries);
                    this._changeDetectorRef.detectChanges();
                });
            });
    }

    private _connectWebSocket() {
        const symbol = `${this.selectedTicker.name}USDT`.toLowerCase();
        const interval = '1m';
        if (this.webSocket) {
            this.webSocket.close();
        }
        this.webSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`);

        this.webSocket.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            const kline = data.k;

            const candle = {
                time: kline.t / 1000 as UTCTimestamp, // Convert to seconds
                open: parseFloat(kline.o), // Open price
                high: parseFloat(kline.h), // High price
                low: parseFloat(kline.l), // Low price
                close: parseFloat(kline.c) // Closing price
            };

            this.candlestickSeries.update(candle);

            if (kline.x) {
                this.endDate = kline.t;
                // this._getSignals();
            }
        };
    }

    private _setStartDate(): void {
        this.startDate = this.endDate - this.selectedPeriod * 24 * 60 * 60 * 1000; // Start time for historical data
    }
}
