import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { ReportComponent } from 'app/modules/report/report.component';
import { TickerService } from 'app/core/services/ticker.service';

export default [
    {
        path: '',
        component: ReportComponent,
        resolve: {
            data: () => inject(TickerService).getTickers(),
        },
    },
] as Routes;
