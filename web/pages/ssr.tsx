import { GetServerSideProps } from 'next';
import React from 'react';
import '../styles/globals.css';

const SSR = (props) => {
  return (
    <>
      {props.isSSR ? <p>SSR working</p> : <p>SSR not works</p>}
      <p>{`Build at: ${props.now}`}</p>
      <p>{`API result: ${props.apiResult}`}</p>
    </>
  );
};

export default SSR;

export const getServerSideProps: GetServerSideProps = async () => {
  // 链接firebase数据库获取player数据
  const response = await fetch(
    'https://asia-northeast1-windy10v10ai.cloudfunctions.net/admin/api',
  );
  const responseText = response.ok ? await response.text() : 'Failed to fetch';

  return {
    props: {
      isSSR: true,
      now: new Date().toISOString(),
      apiResult: responseText,
    },
  };
};
