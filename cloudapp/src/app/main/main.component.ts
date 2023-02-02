import { Observable, forkJoin, Subscription, of  } from 'rxjs';
import { concatMap, map, catchError } from 'rxjs/operators';
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CloudAppRestService, CloudAppEventsService, Request, HttpMethod, 
  Entity, RestErrorResponse, PageInfo, CloudAppSettingsService } from '@exlibris/exl-cloudapp-angular-lib';
import { MatSelectionListChange, MatSelectionList, MatListOption } from '@angular/material/list';
import { PriceResponse, PlaceOrderResponse } from '../models/response';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { RestProxyService } from '../services/rest-proxy.service';
import { Settings } from '../models/settings';
import { MatCheckbox } from '@angular/material/checkbox';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit, OnDestroy {
  @ViewChild('requests') requests: MatSelectionList;
  @ViewChild('termsofuse') termsofuse: MatCheckbox;
  private pageLoad$: Subscription;
  loading = false;
  placeOrderEnded = false;
  settings;
  hasSettings = false;
  selectedEntity: Entity;
  apiResult: any;
  pageEntities: Entity[];
  selectedEntities: Entity[];
  requestIdToRequest = new Map();
  requestToPrice : Map<string,PriceResponse> = new Map<string,PriceResponse>();
  requestToOrder : Map<string,PlaceOrderResponse> = new Map<string,PlaceOrderResponse>();
  orderResponse;

  entities$: Observable<Entity[]> = this.eventsService.entities$;

  constructor(
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private settingsService: CloudAppSettingsService,
    private http: HttpClient,
    private rest: RestProxyService,
  ) { }

  ngOnInit() {
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    this.settingsService.get().subscribe(settings => {
      this.settings = settings as Settings;
      if(this.settings.institute){
        this.hasSettings = true;
      }
    });
  }

  ngOnDestroy(): void {
  }

  onPageLoad = (pageInfo: PageInfo) => {
    this.pageEntities = pageInfo.entities;
    if ((this.pageEntities || []).length > 0 && this.pageEntities[0].type === 'BORROWING_REQUEST') {
      this.requestIdToRequest.clear();
      this.requestToPrice.clear();
      this.requestToOrder.clear();
      this.loadEntities();
    } 
  }

  loadEntities(){
    this.loading = true;
    let calls = [];
    
    this.pageEntities.forEach(entity => calls.push(this.restService.call(entity.link).pipe(
      map((res) => {
        this.requestIdToRequest.set(res.request_id, res);
        if(this.isEnabled(res.request_id)){
          if(res.issn){
            let url = "/request/info?issn=" + res.issn;
            if(res.year){
              url += "&year=" + res.year;
            }
            return this.rest.call<any>(url, null).subscribe({
              next: response => {
                this.setRequestPrice(res.request_id, response, null);
              },error: error => {
                console.log(error);
                this.setRequestPrice(res.request_id, null, error);
              }
            });
          }
          this.setRequestPrice(res.request_id, null, "missing ISSN");
        }
      }), 
      catchError(e => of(e))
    )));
    forkJoin(calls).subscribe({
      complete: () => {
        this.loading = false;
      },
      error: error => {
        console.log(error);
        this.loading = false;
      }      
    });
  }

  setRequestPrice(requestId, response, error){
    let priceObject = new PriceResponse();
    priceObject.requestId = requestId;
    if(error){
      priceObject.errorMsg = error;
      priceObject.availablity = "F";
    }
    if(response){
      let responseList = response.split(',');
      if(responseList){
        if(responseList[0]){
          priceObject.availablity = responseList[0];
        }
        if(responseList[1]){
          priceObject.price = responseList[1];
        }
        if(responseList[2]){
          priceObject.ginPublisherCode = responseList[2];
        }
      }
    }
    this.requestToPrice.set(requestId, priceObject);
  }

  getEntityPrice(requestId){
    let priceObject = this.requestToPrice.get(requestId);
    if(priceObject && priceObject.price){
      if(priceObject.price.length == 4){
        return priceObject.price + '0';
      }
      return priceObject.price;
    }
    return "-1";
  }

  isPriceLoaded(requestId){
    let priceObject = this.requestToPrice.get(requestId);
    return priceObject && priceObject.availablity;
  }
  
  getPriceErrorMsg(requestId){
    let priceObject = this.requestToPrice.get(requestId);
    if(priceObject && priceObject.errorMsg) {
      return priceObject.errorMsg;
    }
    return "";
  }

  getRequestAvailability(requestId){
    let priceObject = this.requestToPrice.get(requestId);
    if(priceObject && priceObject.availablity) {
      return priceObject.availablity;
    }
    return "F";
  }

  getEntityAuthor(requestId){
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.author){
      return requestObject.author;
    }
    return "";
  }

  getEntityJournalTitle(requestId){
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.journal_title){
      return requestObject.journal_title;
    }
    return "";
  }

  getEntityPublication(requestId){
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.year){
      return requestObject.year;
    }
    return "";
  }

  getEntityPages(requestId){
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.pages){
      return requestObject.pages;
    }
    return "";
  }

  onSelectAllClicked(){
    this.requests.options.forEach(request => {
      let requestId = request.value.id;
      if(!this.loading && this.isEnabled(requestId) && (this.isPriceLoaded(requestId) && this.getEntityPrice(requestId)!="-1")){
        request.selected = true;
      }
    });
  }

  onSelectedChanged($event: MatSelectionListChange) {
    let requestId = $event.option.value.id;
    if(this.loading || !this.isEnabled(requestId) || (this.isPriceLoaded(requestId) && this.getEntityPrice(requestId)=="-1")){
      event.preventDefault();
      event.stopPropagation();
      $event.option.selected = false;
      return;
    }
  }

  isEnabled(requestId){
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject && requestObject.format && requestObject.status){
      if((requestObject.format.value == "DIGITAL") && this.isPartnerCanBeUpdated(requestObject.status.value)){
        return true;
      }else{
        let priceObject = this.requestToPrice.get(requestId);
        if(!priceObject){
          let priceObject = new PriceResponse();
          priceObject.requestId = requestId;
          priceObject.availablity = "N";
          this.requestToPrice.set(requestId, priceObject);
        }
      }
    }
    return false;
  }

  onPlaceOrderClicked(event, requestId){
    event.preventDefault();
    event.stopPropagation();
    this.placeOrderEnded = false;
    let orderObject = new PlaceOrderResponse();
    orderObject.status = "loading";
    this.requestToOrder.set(requestId, orderObject);
    if(!this.termsofuse.checked){
      this.setOrderErrorMsg(requestId, "To submit an order, you must accept the terms of use");
      return;
    }
    let requestObject = this.requestIdToRequest.get(requestId);
    if(requestObject.title && requestObject.author && (requestObject.issn || requestObject.isbn) && this.settings.institute && this.settings.illEmail && this.settings.billEmail){
      let url = this.getRequestUrl(requestId, requestObject);
      this.rest.call<any>(url, null).subscribe({
        next: response => {
          this.getItemNumberAndConfirmRequest(response, requestId);
        },error: error => {
          console.log(error.error);
          this.setOrderErrorMsg(requestId, "Failed to submit request");
        }
      });
    }else{
      this.setOrderErrorMsg(requestId, "missing parameters");
    }
  }

  getRequestUrl(requestId, requestObject){
    let url = "/request";
    url += "?title=" + requestObject.title;
    url +=  "&author=" + requestObject.author;
    url += "&partner=rapido&orderSource="+ this.settings.institute + "&requestId=" + requestId;
    url += this.getUrlPages(requestObject);
    url += "&institute=" + this.settings.institute;
    url += "&illEmail=" + this.settings.illEmail;
    url += "&userBilled=" + this.settings.billEmail;
    let publication = requestObject.issn ? requestObject.issn : requestObject.isbn;
    url +=  "&publication=" + publication;
    let priceObject = this.requestToPrice.get(requestId);
    if(!priceObject && priceObject.ginPublisherCode){
      url += "&publisherName=" + priceObject.ginPublisherCode;
    }
    if(requestObject.year){
      url += "&publicationDate=" + requestObject.year;
    }
    if(requestObject.volume){
      url += "&volumeNum=" + requestObject.volume;
    }
    if(requestObject.issue){
      url += "&issueNum=" + requestObject.issue;
    }
    if(requestObject.doi){
      url += "&contentID=" + requestObject.doi;
      url += "&directURL=" + requestObject.doi;
    }else if(requestObject.pmid){
      url += "&directURL=" + requestObject.pmid;
    }
    if(requestObject.publisher){
      url += "&copyright=" + requestObject.publisher;
    }
    return url;
  }

  getUrlPages(requestObject){
    let pages = "";
    if(requestObject.start_page){
      pages += "&startPage=" + requestObject.start_page;
    }
    if(requestObject.end_page){
      pages += "&endPage=" + requestObject.end_page;
    }
    if(requestObject.pages){
      let pagesList = requestObject.pages.split('-');
      if(pagesList && pagesList[0]){
        pages += "&startPage=" + pagesList[0];
      }
      if(pagesList && pagesList[1]){
        pages += "&endPage=" + pagesList[1];
      }
    }
    return pages;
  }

  getItemNumberAndConfirmRequest(response, requestId){
    let parser = new DOMParser();
    let html = parser.parseFromString(response, "text/html");
    let elements = html.getElementsByName('item_number');
    if(elements && elements.length > 0){
      let itemNumber = (<HTMLInputElement>elements[0]).value;
      if(itemNumber && this.settings.partnerCode){
        let url = "/request/process";
        const params = new URLSearchParams({ item_number: itemNumber, custom: this.settings.illEmail });
        this.rest.call<any>({ url: url, method: HttpMethod.POST }, params).subscribe({
          next: response => {
            // let parser = new DOMParser();
            let html = parser.parseFromString(response, "text/html");
            let orderNumber = html.getElementById('jobTicket_orderNumber');
            if(orderNumber){
              this.updatePartner(requestId, orderNumber.innerHTML, this.settings.partnerCode);
              let orderObject = this.requestToOrder.get(requestId);
              orderObject = this.requestToOrder.get(requestId);
              orderObject.status = "done";
            }else{
              let errorMsg = "Failed to submit request";
              let errorMsgElement = html.getElementById('requestFailureMessage');
              if(errorMsgElement){
                errorMsg = orderNumber.innerHTML;
              }
              this.setOrderErrorMsg(requestId, "Failed to submit request");
            }
          },error: error => {
            console.log(error);
            this.setOrderErrorMsg(requestId, "Failed to submit request");
          }
        });
      }else{
        this.setOrderErrorMsg(requestId, "Failed to submit request");
      }
    }else{
      this.setOrderErrorMsg(requestId, "Failed to submit request");
    }
  }

  setOrderErrorMsg(requestId, error){
    let orderObject = this.requestToOrder.get(requestId);
    if(orderObject){
      orderObject.status = "failed";
      orderObject.errorMsg = error;
    }else{
      let orderObject = new PlaceOrderResponse();
      orderObject.status = "failed";
      orderObject.errorMsg = error;
      this.requestToOrder.set(requestId, orderObject);
    }
  }

  updatePartner(requestId, orderNumber, partnerCode){
    let requestObject = this.requestIdToRequest.get(requestId);
    let updateUrl = "/rapido/v1/user/" + requestObject.requester.value + "/resource-sharing-requests/" + requestId + "?op=assign_request_to_partner&partner=" + partnerCode + "&partner_request_id=" + orderNumber;
    let priceObject = this.requestToPrice.get(requestId);
    if(priceObject && priceObject.price){
      updateUrl += "&cost=" + priceObject.price;
    }
    let request : Request = {
      url: updateUrl,
      method: HttpMethod.POST
    };
    this.restService.call(request).subscribe({
      next: data =>{
        let a = data;
      },
      error: error => {
        console.log(error);
        this.placeOrderEnded = true;
      }, 
      complete: () => this.placeOrderEnded = true
    });
  }

  getEntityOrderStatus(requestId){
    let orderObject = this.requestToOrder.get(requestId);
    if(orderObject && orderObject.status){
      return orderObject.status;
    }
    return "";
  }

  getOrderErrorMsg(requestId){
    let orderObject = this.requestToOrder.get(requestId);
    if(orderObject && orderObject.errorMsg){
      return orderObject.errorMsg;
    }
    return "";
  }

  isPartnerCanBeUpdated(requestStatus){
    let allowedStatuses = ["REQUEST_CREATED_BOR", "READY_TO_SEND", "LOCATE_FAILED", "REJECTED", "RESUBMIT", "EXPIRED", "RECALLED_BOR", "PENDING_APPROVAL", "REJECT", "BAD_CITATION", "LOCAL_HOLDING"];
    return (allowedStatuses.indexOf(requestStatus) != -1);
  }

  onBulkPlaceOrderClicked(selectedOptions: MatListOption[]){
    this.placeOrderEnded = false;
    let selectedRequests = selectedOptions.map(o => o.value);
    if(!this.termsofuse.checked){
      selectedRequests.forEach(entity => {
        this.setOrderErrorMsg(entity.id, "To submit an order, you must accept the terms of use")
      })
      return;
    }
    forkJoin({ initData: this.eventsService.getInitData(), authToken: this.eventsService.getAuthToken() }).pipe(concatMap((data) => {
      let authHeader = "Bearer " + data.authToken;
      const headers = new HttpHeaders({
        'content-type': 'application/json',
        'accept': 'application/json',
        'authorization': authHeader,
        'X-Proxy-Host': 'https://getitnow.dem1.copyright.com/',
      });

      let calls = [];      
      selectedRequests.forEach(entity => {
        this.placeOrderEnded = false;
        let orderObject = new PlaceOrderResponse();
        orderObject.status = "loading";
        this.requestToOrder.set(entity.id, orderObject);
        let requestObject = this.requestIdToRequest.get(entity.id);
        if(requestObject.title && requestObject.author && (requestObject.issn || requestObject.isbn) && this.settings.institute && this.settings.illEmail && this.settings.billEmail){
          let url = this.getRequestUrl(entity.id, requestObject);
          calls.push(this.http.get("https://api-ap.exldevnetwork.net/proxy"+url, { headers, responseType: 'text' }).pipe(
            map((res) => {
              this.getItemNumberAndConfirmRequest(res, entity.id);
            }), 
            catchError((error) => {
              console.log(error.error);
              orderObject = this.requestToOrder.get(entity.id);
              orderObject.status = "failed";
              orderObject.errorMsg = "Failed to submit request";
              return of(error);
            })
          ));
        }else{
          orderObject.status = "failed";
          orderObject.errorMsg = "missing parameters";
        }
      });
      return forkJoin(calls);
    })).subscribe({
      error: error => {
        console.log(error);
      }, 
      complete: () => this.placeOrderEnded = true
    });
  }

}


const isRestErrorResponse = (object: any): object is RestErrorResponse => 'error' in object;