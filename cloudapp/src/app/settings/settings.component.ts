import { Component, OnInit } from '@angular/core';
import { AppService } from '../app.service';
import { CloudAppSettingsService, AlertService, FormGroupUtil } from '@exlibris/exl-cloudapp-angular-lib';
import { Settings } from '../models/settings';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  form: FormGroup;
  saving = false;
  settings: Settings;

  constructor(
    private appService: AppService,
    private settingsService: CloudAppSettingsService,
    private alert: AlertService,
  ) { }

  ngOnInit(): void {
    // this.appService.setTitle('Settings');
    this.settingsService.get().subscribe( settings => {
      this.form = FormGroupUtil.toFormGroup(Object.assign(new Settings(), settings))
    });
  }

  save() {
    this.saving = true;
    this.settingsService.set(this.form.value).subscribe(
      response => {
        this.alert.success('Settings successfully saved.');
        this.form.markAsPristine();
      },
      err => this.alert.error(err.message),
      ()  => this.saving = false
    );
  }

}
