/* GPL-3.0. */
// Steam API 库仅提供 Intel 架构，需要在独立辅助进程中加载。
#include <dlfcn.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <time.h>
static void* symbol(void* lib,const char* name) {void* p=dlsym(lib,name);if(!p){fprintf(stderr,"Missing Steam API: %s\n",name);exit(2);}return p;}
int main(int argc,char**argv) {
    if(argc!=3)return 2;
    setenv("SteamAppId","570",1);
    void*lib=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);
    if(!lib){fprintf(stderr,"%s\n",dlerror());return 2;}
    int(*init)(char*)=symbol(lib,"SteamAPI_InitFlat");
    char error[1024]={0};if(init(error)!=0){fprintf(stderr,"Steam initialization: %s\n",error);return 3;}
    void(*shutdown)(void)=symbol(lib,"SteamAPI_Shutdown");
    void(*run)(void)=symbol(lib,"SteamAPI_RunCallbacks");
    void*(*ugcFn)(void)=NULL;
    for(int v=30;v>=21;v--){char name[64];snprintf(name,sizeof(name),"SteamAPI_SteamUGC_v%03d",v);ugcFn=dlsym(lib,name);if(ugcFn)break;}
    if(!ugcFn){shutdown();return 2;}
    void*ugc=ugcFn();void*(*utilsFn)(void)=symbol(lib,"SteamAPI_SteamUtils_v010");void*utils=utilsFn();
    uint64_t(*subscribe)(void*,uint64_t)=symbol(lib,"SteamAPI_ISteamUGC_SubscribeItem");
    bool(*done)(void*,uint64_t,bool*)=symbol(lib,"SteamAPI_ISteamUtils_IsAPICallCompleted");
    bool(*download)(void*,uint64_t,bool)=symbol(lib,"SteamAPI_ISteamUGC_DownloadItem");
    uint32_t(*state)(void*,uint64_t)=symbol(lib,"SteamAPI_ISteamUGC_GetItemState");
    uint64_t id=strtoull(argv[2],NULL,10),call=subscribe(ugc,id);time_t start=time(NULL);bool failed=false;
    while(!done(utils,call,&failed)&&time(NULL)-start<15){run();usleep(100000);}
    if(failed||!download(ugc,id,true)){fprintf(stderr,"Steam could not queue the map download.\n");shutdown();return 4;}
    puts("Steam is checking and downloading the Workshop map.");fflush(stdout);start=time(NULL);
    int result=5;
    while(time(NULL)-start<600){run();uint32_t flags=state(ugc,id);if(time(NULL)-start>2&&(flags&(16|32))==0){result=((flags&4)&&!(flags&8))?0:4;break;}usleep(500000);}
    shutdown();return result;
}
