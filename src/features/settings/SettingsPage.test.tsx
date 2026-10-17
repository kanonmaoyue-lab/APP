import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {test,expect} from 'vitest';
import SettingsPage from './SettingsPage';
import {openRepository} from '../../data/repository';
import {newProfile} from '../../domain/types';
test('preferences and custom categories persist in the account queue',async()=>{const r=openRepository(crypto.randomUUID()),{unmount}=render(<SettingsPage repository={r} profile={newProfile(r.userId)}/>);fireEvent.change(screen.getByLabelText('账号时区'),{target:{value:'Asia/Tokyo'}});fireEvent.click(screen.getByRole('button',{name:'保存偏好'}));await waitFor(async()=>expect((await r.list('profiles'))[0]?.timeZone).toBe('Asia/Tokyo'));fireEvent.change(screen.getByLabelText('分类名称'),{target:{value:'学习'}});fireEvent.click(screen.getByRole('button',{name:'添加分类'}));expect(await screen.findByText('学习')).toBeVisible();unmount();await r.clear();r.close();});
