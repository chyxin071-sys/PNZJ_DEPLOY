import { create } from 'zustand';
import type { BizType } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface BizState {
  currentBizType: BizType;
  setBizType: (t: BizType) => void;
  bizTypes: BizType[];
  setBizTypes: (types: BizType[]) => void;
}

export const useBizStore = create<BizState>((set) => {
  const user = useAuthStore.getState().user;
  const userBizTypes = (user?.bizTypes as BizType[]) || (user?.role === 'admin' || user?.role === 'finance' ? ['家装', '工装'] : ['家装']);
  return {
    currentBizType: (localStorage.getItem('erp_bizType') as BizType) || userBizTypes[0] || '家装',
    setBizType: (t) => {
      localStorage.setItem('erp_bizType', t);
      set({ currentBizType: t });
    },
    bizTypes: userBizTypes,
    setBizTypes: (types) => set({ bizTypes: types }),
  };
});

useAuthStore.subscribe((state) => {
  const user = state.user;
  const userBizTypes = (user?.bizTypes as BizType[]) || (user?.role === 'admin' || user?.role === 'finance' ? ['家装', '工装'] : ['家装']);
  useBizStore.getState().setBizTypes(userBizTypes);
  const current = useBizStore.getState().currentBizType;
  if (!userBizTypes.includes(current)) {
    useBizStore.getState().setBizType(userBizTypes[0] || '家装');
  }
});