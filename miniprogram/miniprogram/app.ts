interface GlobalData {
  accessToken?: string;
}

export interface AppCustomOptions {
  globalData: GlobalData;
}

App<AppCustomOptions>({
  globalData: {},
  onLaunch() {
    const accessToken = wx.getStorageSync<string>('accessToken');
    if (accessToken) this.globalData.accessToken = accessToken;
  },
});

