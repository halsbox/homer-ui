import {
    Component,
    OnInit,
    Input,
    Output,
    EventEmitter,
    ViewChild,
    OnDestroy,
    ChangeDetectionStrategy,
    ChangeDetectorRef
} from '@angular/core';
import { Functions } from '@app/helpers/functions';
import { MatTabGroup } from '@angular/material/tabs';
import { AfterViewInit } from '@angular/core';
import {
  PreferenceAdvancedService
} from '@app/services';

@Component({
    selector: 'app-tab-hepsub',
    templateUrl: './tab-hepsub.component.html',
    styleUrls: ['./tab-hepsub.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabHepsubComponent implements OnInit, OnDestroy, AfterViewInit {
    _dataItem: any;

    @Input() id: any;
    @Input() callid: any;
    @Input() set dataItem(value: any) {
        this._dataItem = value;

        if (this.dataItem.data.heplogs) {
            this.dataLogs = this.dataItem.data.heplogs;
        }
        this.isLogs = this.dataLogs?.length > 0;

        const { agentCdr } = this._dataItem.data;

        if (agentCdr) {
            this.subTabList.push({
                title: agentCdr.node
            });

            agentCdr.data.data = Functions.JSON_parse(agentCdr.data.data) || agentCdr.data.data;
            this.jsonData = agentCdr.data;
        }

        this.cdr.detectChanges();
    }
    get dataItem(): any {
        return this._dataItem;
    }
    @Input() dataLogs: Array<any>;
    @Input() snapShotTimeRange: any;
    @Output() haveData = new EventEmitter();
    @Output() ready: EventEmitter<any> = new EventEmitter();
    @ViewChild('matTabGroup', { static: false }) matTabGroup: MatTabGroup;
    indexTabPosition = 0;

    isLogs = true;
    extraTemplates = [];
    subTabList = [];
    jsonData: any;
    _interval: any;
    constructor(
      private _pas: PreferenceAdvancedService,
      private cdr: ChangeDetectorRef
    ) { }
    ngAfterViewInit() {
        setTimeout(() => {
            this.ready.emit({});
        }, 35)
    }

    ngOnInit() {
      this._pas.getAll().toPromise().then((advanced: any) => {
        const [extraTemplates] = advanced.data
            .filter(i => i.category === 'search' && i.param === 'lokiserver')
            .map(i => i.data.extraTemplates);
        if (typeof extraTemplates !== 'undefined') {
            if (this._dataItem.hasOwnProperty('data')) {
                let captureId = this._dataItem.data.messages[0].source_data.captureId;
                this.extraTemplates = extraTemplates.filter(i => (!i.hasOwnProperty('enableOn') &&
                                                                  !i.hasOwnProperty('disableOn')) ||
                                                                 (i.hasOwnProperty('enableOn') &&
                                                                  i.enabledOn.includes(captureId)) ||
                                                                 (i.hasOwnProperty('disableOn') &&
                                                                  !i.disabledOn.includes(captureId)));
            }
        }
      });
      this._interval = setInterval(() => {
          this.matTabGroup.realignInkBar();
          this.cdr.detectChanges();
      }, 2000);
    }

    ngOnDestroy() {
        if (this._interval) {
            clearInterval(this._interval);
        }
    }
}
