import { GetStaticProps } from 'next';
import React from 'react';
import '../styles/globals.css';

const SSG = (props) => {
  return (
    <>
      {props.isStatic ? <p>SSG working</p> : <p>SSG not works</p>}
      <p>{`Build at: ${props.now}`}</p>
      <p>{`API result: ${props.apiResult}`}</p>
    </>
  );
};

export default SSG;

export const getStaticProps: GetStaticProps = async () => {
  return {
    props: {
      isStatic: true,
      now: new Date().toISOString(),
    },
  };
};
