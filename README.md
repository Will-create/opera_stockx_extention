# opera_stockx_extention
```js
async function main()
    {
        let request = await fetch('/api/p/e', {
    method: 'post',
    body: "{\"query\":\"query getProductBadges($id: String!, $currencyCode: CurrencyCode, $marketName: String) {\\n  product(id: $id) {\\n    badges: badges(\\n      currencyCode: $currencyCode\\n      market: $marketName\\n      set: DISPLAY\\n      version: 2\\n    ) {\\n      badgeID\\n      title\\n      subtitle\\n      context {\\n        key\\n        value\\n        format\\n      }\\n      textColor\\n      backgroundColor\\n      borderColor\\n      darkModeIcon {\\n        url\\n        alt\\n      }\\n      lightModeIcon {\\n        url\\n        alt\\n      }\\n      icon {\\n        url\\n        alt\\n      }\\n    }\\n    counterfactualBadges: badges(\\n      currencyCode: $currencyCode\\n      market: $marketName\\n      set: COUNTERFACTUAL\\n      version: 2\\n    ) {\\n      badgeID\\n      context {\\n        key\\n        value\\n        format\\n      }\\n    }\\n    variants {\\n      id\\n      badges: badges(\\n        currencyCode: $currencyCode\\n        market: $marketName\\n        set: DISPLAY\\n        version: 2\\n      ) {\\n        badgeID\\n        title\\n        subtitle\\n        context {\\n          key\\n          value\\n          format\\n        }\\n        textColor\\n        backgroundColor\\n        borderColor\\n        darkModeIcon {\\n          url\\n          alt\\n        }\\n        lightModeIcon {\\n          url\\n          alt\\n        }\\n        icon {\\n          url\\n          alt\\n        }\\n      }\\n      counterfactualBadges: badges(\\n        currencyCode: $currencyCode\\n        market: $marketName\\n        set: COUNTERFACTUAL\\n        version: 2\\n      ) {\\n        badgeID\\n        context {\\n          key\\n          value\\n          format\\n        }\\n      }\\n    }\\n  }\\n}\",\"variables\":{\"id\":\"travis-scott-x-fc-barcelona-2024-25-match-away-cactus-jack-jersey-black\",\"currencyCode\":\"USD\",\"marketName\":\"BF\"},\"operationName\":\"getProductBadges\"}",
        headers: HEADERS
}).then(async function(response) {
    let json = await response.json();
    console.log(json);
}).catch(console.log);

    }
main();
```