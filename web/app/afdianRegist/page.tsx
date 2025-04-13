'use client';
import { useTranslations } from 'next-intl';
import { IdcardOutlined, AccountBookOutlined } from '@ant-design/icons';
import { Form, Input, Button } from 'antd';
import React, { useState } from 'react';
import { submmitBtnDisableStyle, afdianContentStyle } from '../style/CSSProperties';
import { afdianRegistUrl } from '../../config/constant';
import axios from 'axios';
import RegistResult from './registResult';

const formItemLayout = {
  labelCol: {
    xs: { span: 24 },
    sm: { span: 6 },
  },
  wrapperCol: {
    xs: { span: 24 },
    sm: { span: 14 },
  },
};

const afdianRegistPage: React.FC = () => {
  const t = useTranslations('afdianRegist');
  const [steamId, setSteamId] = useState('');
  const [sorderId, setOrderId] = useState('');
  const [submitButtonEnable, setSubmitButtonEnable] = useState<boolean>(false);
  const [regisCommited, setRegisCommited] = useState<boolean>(false);

  const [form] = Form.useForm();
  const values = Form.useWatch([], form);

  const registAfdian = async () => {
    const registResponse = await axios
      .post(afdianRegistUrl, {
        steamId: Number(steamId),
        outTradeNo: sorderId,
      })
      .then((response) => {
        // console.log('registResponse', response);
        if (response.data.steamId === Number(steamId) && response.data.outTradeNo === sorderId) {
          if (response.data.result) {
            // alert(t('success'));
          } else {
            // alert(t('fail'));
          }
        } else {
          //
        }
      })
      .catch((error) => {
        // console.error('registResponse error', error);
        // alert(t('error'));
      });
    console.log('registResponse', registResponse);
    // return registResponse;
  };

  const onFinish = () => {
    registAfdian();
  };

  React.useEffect(() => {
    console.log('values', values);
    form
      .validateFields({ validateOnly: true })
      .then(() => setSubmitButtonEnable(true))
      .catch(() => setSubmitButtonEnable(false));
  }, [form, values]);

  return (
    <div className="space-y-8" style={afdianContentStyle}>
      {!regisCommited ? (
        <>
          <h1 className="title-primary mb-6">{t('title')}</h1>
          <p className="text-content mb-8">{t('description')}</p>

          <Form form={form} {...formItemLayout} style={{ maxWidth: 600 }} onFinish={onFinish}>
            <Form.Item
              label={<label style={{ color: 'white' }}>{t('input.steamId.title')}</label>}
              name={'steamId'}
              hasFeedback
              rules={[
                {
                  required: true,
                  message: t('input.steamId.help'),
                  type: 'string',
                  max: 10,
                  pattern: /^[0-9]+$/,
                },
              ]}
            >
              <Input
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder={t('input.steamId.placeholder')}
                prefix={<IdcardOutlined />}
                id="inputSteamId"
                allowClear
                showCount
              />
            </Form.Item>

            <Form.Item
              label={<label style={{ color: 'white' }}>{t('input.afdianOrderId.title')}</label>}
              name={'afdianOrderId'}
              hasFeedback
              rules={[
                {
                  required: true,
                  message: t('input.afdianOrderId.help'),
                  type: 'string',
                  min: 26,
                  max: 26,
                  pattern: /^[0-9]+$/,
                },
              ]}
            >
              <Input
                value={sorderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder={t('input.afdianOrderId.placeholder')}
                prefix={<AccountBookOutlined />}
                id="inputAfdianOrderId"
                allowClear
                showCount
              />
            </Form.Item>

            <Form.Item label={null}>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!submitButtonEnable}
                style={{ ...(!submitButtonEnable ? submmitBtnDisableStyle : {}) }}
              >
                {t('submitButton.buttonText')}
              </Button>
            </Form.Item>
          </Form>
        </>
      ) : (
        <RegistResult />
      )}
    </div>
  );
};

export default afdianRegistPage;
