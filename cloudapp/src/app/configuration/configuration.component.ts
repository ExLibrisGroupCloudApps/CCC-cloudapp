import { Component, OnInit } from '@angular/core';
import { AppService } from '../app.service';
import { CloudAppConfigService, AlertService, FormGroupUtil } from '@exlibris/exl-cloudapp-angular-lib';
import { Configuration } from '../models/configuration';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-settings',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss']
})
export class ConfigurationComponent implements OnInit {
  form: FormGroup;
  saving = false;
  configuration: Configuration;

  constructor(
    private appService: AppService,
    private configurationService: CloudAppConfigService,
    private alert: AlertService,
  ) { }

  ngOnInit(): void {
    // this.appService.setTitle('Configuration');
    this.configurationService.get().subscribe( configuration => {
      this.form = FormGroupUtil.toFormGroup(Object.assign(new Configuration(), configuration))
    });
  }

  save() {
    this.saving = true;
    this.configurationService.set(this.form.value).subscribe(
      response => {
        this.alert.success('Configuration successfully saved.');
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }

}
