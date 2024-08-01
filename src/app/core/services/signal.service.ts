import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from 'environments/environment'
import { Signal } from 'app/core/models/signal.types';
import { Ticker } from '../models/ticker.types';

@Injectable({ providedIn: 'root' })
export class SignalService {
    private _signals: BehaviorSubject<Signal[]> = new BehaviorSubject(null);

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
    get signals$(): Observable<Signal[]> {
        return this._signals.asObservable();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get signals
     */
    getSignalsByTickerAndDateTime(ticker: Ticker, startDate: Date, endDate: Date): Observable<Signal[]> {
        return this._httpClient.get(`${environment.apiUrl}/signals/${ticker._id}/${startDate.toISOString()}/${endDate.toISOString()}`).pipe(
            tap((response: Signal[]) => {
                this._signals.next(response);
            })
        );
    }
}
