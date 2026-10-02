#define _POSIX_C_SOURCE 200809L
#include <linux/input.h>
#include <sys/ioctl.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <errno.h>

/* Type-B Goodix capture. Calibration output only; never changes tasks.
 * EVIOCGRAB prevents a calibration tap leaking into the native launcher.
 * Accept a single-finger press/release, not a drag or multi-touch gesture. */
static volatile sig_atomic_t stop;
static void interrupted(int sig) { (void)sig; stop=1; }
static long long milliseconds(void) {
    struct timespec t;
    if(clock_gettime(CLOCK_MONOTONIC,&t)) return 0;
    return (long long)t.tv_sec*1000+t.tv_nsec/1000000;
}
struct slot { int active, x, y, have_x, have_y; };
int main(int argc,char **argv) {
    if(argc==3 && !strcmp(argv[1],"--delay-ms")) {
        char *tail; long ms=strtol(argv[2],&tail,10);
        if(*tail || ms<1 || ms>1000)return 2;
        struct timespec delay={ms/1000,(ms%1000)*1000000L};
        while(nanosleep(&delay,&delay)<0)if(errno!=EINTR)return 1;
        return 0;
    }
    if(argc!=3) { fprintf(stderr,"usage: kindle-touch /dev/input/eventN seconds\n"); return 2; }
    char *end; long duration=strtol(argv[2],&end,10);
    if(*end || duration<1 || duration>60 || strncmp(argv[1],"/dev/input/event",16)) return 2;
    int fd=open(argv[1],O_RDONLY|O_NONBLOCK|O_CLOEXEC);
    if(fd<0) { perror("open touch"); return 1; }
    char name[128]={0}; struct input_absinfo ax,ay,as;
    if(ioctl(fd,EVIOCGNAME(sizeof(name)),name)<0 || strcmp(name,"goodix-ts") ||
       ioctl(fd,EVIOCGABS(ABS_MT_POSITION_X),&ax)<0 || ioctl(fd,EVIOCGABS(ABS_MT_POSITION_Y),&ay)<0 ||
       ioctl(fd,EVIOCGABS(ABS_MT_SLOT),&as)<0 || as.minimum!=0 || as.maximum>31 ||
       ax.maximum<=ax.minimum || ay.maximum<=ay.minimum) {
        fprintf(stderr,"Unsupported touch capabilities; not grabbing\n");close(fd);return 1;
    }
    signal(SIGTERM,interrupted);signal(SIGINT,interrupted);signal(SIGHUP,interrupted);
    if(ioctl(fd,EVIOCGRAB,1)<0) { perror("grab touch");close(fd);return 1; }
    setvbuf(stdout,NULL,_IOLBF,0);
    struct slot slots[32]={0};
    int slot=as.value, tracking[33]={ABS_MT_TRACKING_ID};
    if(slot<0 || slot>as.maximum || ioctl(fd,EVIOCGMTSLOTS((as.maximum+2)*sizeof(int)),tracking)<0) {
        fprintf(stderr,"Cannot obtain initial slots\n");close(fd);return 1;
    }
    int initial=0;
    for(int i=0;i<=as.maximum;i++) { slots[i].active=tracking[i+1]>=0;initial+=slots[i].active; }
    int xs[33]={ABS_MT_POSITION_X},ys[33]={ABS_MT_POSITION_Y};
    if(ioctl(fd,EVIOCGMTSLOTS((as.maximum+2)*sizeof(int)),xs)<0 || ioctl(fd,EVIOCGMTSLOTS((as.maximum+2)*sizeof(int)),ys)<0) {
        fprintf(stderr,"Cannot obtain initial coordinates\n");close(fd);return 1;
    }
    for(int i=0;i<=as.maximum;i++) { slots[i].x=xs[i+1];slots[i].y=ys[i+1];slots[i].have_x=slots[i].have_y=1; }
    printf("READY xmin=%d xmax=%d ymin=%d ymax=%d slots=%d event_size=%zu\n",ax.minimum,ax.maximum,ay.minimum,ay.maximum,as.maximum+1,sizeof(struct input_event));
    long long start=milliseconds(),pressed=0;
    int gesture=0,bad=initial>0,blocked=initial>0,firstx=0,firsty=0,lastx=0,lasty=0;
    int rx=ax.maximum-ax.minimum,ry=ay.maximum-ay.minimum;
    int taps=0,rc=0;
    while(!stop && milliseconds()-start<duration*1000) {
        struct pollfd p={fd,POLLIN,0};
        int n=poll(&p,1,100);
        if(n<0) { if(errno==EINTR)continue;rc=1;break; }
        if(p.revents&(POLLERR|POLLHUP|POLLNVAL)) { rc=1;break; }
        if(!(p.revents&POLLIN))continue;
        struct input_event e;
        if(read(fd,&e,sizeof(e))!=(ssize_t)sizeof(e)) { if(errno==EAGAIN)continue;rc=1;break; }
        if(e.type==EV_SYN && e.code==SYN_DROPPED) { fprintf(stderr,"Dropped input; stopping safely\n");rc=1;break; }
        if(e.type==EV_ABS) {
            if(e.code==ABS_MT_SLOT) { if(e.value<0||e.value>as.maximum){rc=1;break;} slot=e.value; }
            else if(e.code==ABS_MT_TRACKING_ID) {
                slots[slot].active=e.value>=0;
            } else if(e.code==ABS_MT_POSITION_X) { slots[slot].x=e.value;slots[slot].have_x=1; }
            else if(e.code==ABS_MT_POSITION_Y) { slots[slot].y=e.value;slots[slot].have_y=1; }
        }
        if(e.type==EV_SYN && e.code==SYN_REPORT) {
            int count=0,idx=0;
            for(int i=0;i<=as.maximum;i++)if(slots[i].active){count++;idx=i;}
            if(count>1)bad=1;
            if(count==1 && !blocked && slots[idx].have_x && slots[idx].have_y) {
                lastx=slots[idx].x;lasty=slots[idx].y;
                if(!gesture){gesture=1;firstx=lastx;firsty=lasty;pressed=milliseconds();}
                if(abs(lastx-firstx)>rx/30 || abs(lasty-firsty)>ry/30)bad=1;
            }
            if(!count) {
                if(gesture&&!bad&&!blocked&&milliseconds()-pressed<3000) {
                    printf("TAP %d %d %d\n",++taps,lastx,lasty);
                }
                gesture=bad=blocked=0;
            }
        }
    }
    ioctl(fd,EVIOCGRAB,0);close(fd);
    printf("END taps=%d interrupted=%d rc=%d\n",taps,(int)stop,rc);
    return rc;
}
