import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnInit,
    Output,
    ViewEncapsulation
} from '@angular/core';
import { Functions, log } from '@app/helpers/functions';
import { PreferenceAdvancedService, SearchRemoteService, SearchService } from '@app/services';
import { DateTimeRangeService } from '@app/services/data-time-range.service';

@Component({
    selector: 'app-loki-results',
    templateUrl: './loki-results.component.html',
    styleUrls: ['./loki-results.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LokiResultsComponent implements OnInit, AfterViewInit {
    @Input() id;
    @Input() dataItem: any;
    @Input() extraTpl: any;
    @Input() isDisplayResult = false;
    @Input() isResultPage = false;

    _logQlText = '';
    @Input() set logQlText(val) {
        this._logQlText = val;
        this.getLabels();
        this.isFirstSearch = true;
    }

    @Input() customTimeRangeQuery: any | null = null;

    get logQlText() {
        return this._logQlText;
    }

    queryText: string;
    queryObject: any;
    rxText: string;
    searchTemplate = '';
    resultsSorter = [];
    resultsLimit = 100;
    timeRangeFromData = false;
    timeRangeStartOffset = 0;
    timeRangeEndOffset = 0;
    showTime = true;
    showTags = false;
    showTs = false;
    showLabels = true;
    queryStatsNum = [];
    queryStatsText;
    checked: boolean;
    resultData: Array<any> = [];
    isFirstSearch = true;
    labels: Array<any> = [];
    lokiLabels;
    lokiTemplate;
    loading = false;
    resultsFound = true;
    dataError = false;
    @Output() ready: EventEmitter<any> = new EventEmitter();
    constructor(
        private _pas: PreferenceAdvancedService,
        private _srs: SearchRemoteService,
        private _dtrs: DateTimeRangeService,
        private searchService: SearchService,
        private cdr: ChangeDetectorRef

    ) { }

    ngOnInit() {
        this.customTimeRangeQuery ||= this._dtrs.getDatesForQuery(true);
        if (typeof this.extraTpl !== 'undefined') {
            if (this.extraTpl.hasOwnProperty('template')) {
                this.searchTemplate = this.extraTpl.template;
            }
            if (this.extraTpl.hasOwnProperty('limit')){
                this.resultsLimit = parseInt(this.extraTpl.limit);
            }
            if (this.extraTpl.hasOwnProperty('sortOrder') &&
                Array.isArray(this.extraTpl.sortOrder)) {
                this.resultsSorter = this.extraTpl.sortOrder;
            }
            if (this.extraTpl.hasOwnProperty('timeRangeFromData') &&
                this.extraTpl.timeRangeFromData.hasOwnProperty('enabled')) {
                this.timeRangeFromData = Boolean(this.extraTpl.timeRangeFromData.enabled);
                if (this.extraTpl.timeRangeFromData.hasOwnProperty('startOffset')) {
                    this.timeRangeStartOffset = parseInt(this.extraTpl.timeRangeFromData.startOffset);
                }
                if (this.extraTpl.timeRangeFromData.hasOwnProperty('endOffset')) {
                    this.timeRangeEndOffset = parseInt(this.extraTpl.timeRangeFromData.endOffset);
                }
            }
        }
        this.getLabels();
    }
    ngAfterViewInit() {
        window.requestAnimationFrame(() => {
            this.ready.emit({ });
            this.doSerchResult();
        });
    }

    getLabels() {
        if (this.isDisplayResult) {
            this.queryText = this.logQlText || '{type="call"}';
            return;
        }
        const labels = this.dataItem.data.callid
            .reduce((a, b) => {
                if (a.indexOf(b) === -1) {
                    a.push(b);
                }
                return a;
            }, [])
            .join('|');
        if (this.searchTemplate) {
            this.queryText = this.searchTemplate.replace(/\${(.*?)}/g, (match,token)=>
                token==='labels'?labels:token.split('.').reduce((parent, key) => parent[key], this.dataItem));
            this.cdr.detectChanges();
            return;
        }
        this.lokiTemplate = {
            lineFilterOperator: '|~',
            logStreamSelector: '{job="heplify-server"}'
        };
        this._pas.getAll().toPromise().then((advanced: any) => {
            const [advancedTemplate] = advanced.data
                .filter(i => i.category === 'search' && i.param === 'lokiserver')
                .map(i => i.data.template);
            if (typeof advancedTemplate !== 'undefined'
                && (advancedTemplate.hasOwnProperty('logStreamSelector') || advancedTemplate.hasOwnProperty('lineFilterOperator'))) {
                this.lokiTemplate = advancedTemplate;
                this.cdr.detectChanges();
            }
            if (typeof this.lokiTemplate !== 'undefined') {
                this.queryText = `${this.lokiTemplate.logStreamSelector ? this.lokiTemplate.logStreamSelector : ''} ${this.lokiTemplate.lineFilterOperator} "${labels}"`;
                this.cdr.detectChanges();
            }
            this.cdr.detectChanges();
        });
        this.cdr.detectChanges();
    }
    getSearchTimestamp() {
        if (this.timeRangeFromData &&
            this.dataItem.hasOwnProperty('data')){
            const calldata = this.dataItem.data.data.calldata;
            return {
                from: calldata[0].micro_ts + this.timeRangeStartOffset,
                to: calldata[calldata.length - 1].micro_ts + this.timeRangeEndOffset
            }
        }
        return this._dtrs.getDatesForQuery(true);
    }
    queryBuilder() {
        /** depricated, need use {SearchService} */

        return {
            param: {
                server: this.queryObject.serverLoki, // 'http://127.0.0.1:3100',
                limit: this.queryObject.limit * 1,
                search: this.queryObject.text,
                timezone: this.searchService.getTimeZoneLocal(),
            },
            timestamp: this.getSearchTimestamp(),
        };
    }

    async doSerchResult() {  // here add loading when hit button
        this.queryStatsText = '';
        this.queryStatsNum = [];
        this.rxText = this.queryObject.rxText;
        this.isFirstSearch = false;
        this.loading = true;

        await this._srs.getData(this.queryBuilder()).toPromise().then(res => {

            this.resultData = res && res.data ? (res.data as Array<any>) : [];

            if (this.resultData.length > 0) {
                this.loading = false;
                this.lokiLabels = this.resultData.map((l) => {
                    l.custom_2 = this.labelsFormatter(l.custom_2);
                    return l;
                });

                if (this.resultsSorter.length > 0) {
                    this.resultData = this.resultData.sort(
                        (a, b) => this.resultsSorter.map(o => {
                            let dir = 1;
                            if (o[0] === '-') { dir = -1; o=o.substring(1); }
                            return a[o] > b[o] ? dir : a[o] < b[o] ? -(dir) : 0;
                        }).reduce((p, n) => p ? p : n, 0)
                    );
                }

                this.resultData = this.resultData.map((i) => {
                    i.custom_1 = this.highlight(i.custom_1);
                    return i;
                });

                this.resultsFound = true;

            } else {
                this.loading = false;
                this.resultsFound = false;
            }

        })
        this.loading = false;
        this.cdr.detectChanges();
    }
    onUpdateData(event) {
        this.queryObject = event;
        this.queryObject.limit = this.resultsLimit;
        if (this.isDisplayResult && this.isFirstSearch) {
            this.doSerchResult();
        }
        this.cdr.detectChanges();
    }

    private labelsFormatter(rd) {
        const lokiLabels = Functions.JSON_parse(rd);
        return lokiLabels;
    }

    identify(index, item) {
        return item.micro_ts;
    }

    private highlight(value: string = '') {
        let data;
        if (!!this.rxText) {
            const rxText = this.rxText.replace(/\s|(\|=|\|~|!=|!~)|("|`)/g, '')
                .split('|').sort((a, b) => b.length - a.length).join('|');
            const regex = new RegExp('(' + rxText + ')', 'g');
            data = value
                .replace(/\</g, '&lt;')
                .replace(/\>/g, '&gt;')
                .replace(regex, (g, a) => {
                    return `<span>${a}</span>`;
                });
        } else {
            data = value || '';
        }
        return data;
    }
    showLabel(idx) {
        let tag = document.getElementById('label-' + idx)
        let icon = document.getElementById('icon-' + idx)
        if (tag.style.display === 'none') {
            tag.style.cssText = `
            display:flex;
            flex-direction:column;
            `;
            icon.innerText = 'keyboard_arrow_down'

        } else {
            tag.style.display = 'none'
            icon.innerText = 'navigate_next'
        }
    }
}
