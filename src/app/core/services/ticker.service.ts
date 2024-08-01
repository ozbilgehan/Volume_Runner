import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from 'environments/environment'
import { Ticker } from 'app/core/models/ticker.types';

@Injectable({ providedIn: 'root' })
export class TickerService {
    private _tickers: BehaviorSubject<Ticker[]> = new BehaviorSubject(null);

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient) { }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for data
     */
    get tickers$(): Observable<Ticker[]> {
        return this._tickers.asObservable();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get tickers
     */
    getTickers(): Observable<Ticker[]> {
        return this._httpClient.get(`${environment.apiUrl}/tickers`).pipe(
            tap((response: Ticker[]) => {
                this._tickers.next(response);
            })
        );
    }
}
