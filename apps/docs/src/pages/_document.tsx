import type { EmotionCache } from "@emotion/react";
import createEmotionServer from "@emotion/server/create-instance";
import type { AppProps } from "next/app";
import Document, { type DocumentContext, Head, Html, Main, NextScript } from "next/document";
import React from "react";

import { createEmotionCache } from "~/lib/helpers/createEmotionCache";

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const originalRenderPage = ctx.renderPage;

    const cache = createEmotionCache();
    const { extractCriticalToChunks } = createEmotionServer(cache);

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App) => {
          const WithCache = App as React.ComponentType<AppProps & { emotionCache: EmotionCache }>;
          return (props) => <WithCache emotionCache={cache} {...props} />;
        },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const emotionStyles = extractCriticalToChunks(initialProps.html);
    const emotionStyleTags = emotionStyles.styles.map((style) => (
      <style
        data-emotion={`${style.key} ${style.ids.join(" ")}`}
        key={style.key}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: CSS extracted by Emotion from our own styles, not user input; text children would be HTML-escaped and break selectors
        dangerouslySetInnerHTML={{ __html: style.css }}
      />
    ));

    return {
      ...initialProps,
      styles: [...React.Children.toArray(initialProps.styles), ...emotionStyleTags],
    };
  }

  render() {
    return (
      <Html className="dark">
        <Head />

        <body className="no-scrollbar">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
