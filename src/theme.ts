import type { MantineThemeOverride } from '@mantine/core';

const TOKENS = {
  pageBg: '#FAFAFB',
  cardBg: '#FFFFFF',
  border: 'rgba(15, 23, 42, 0.08)',
  text: '#111827',
  mutedText: '#6B7280',
  primary: '#7BC4B8',
  primaryHover: '#5FAFA3',
  primarySoftBg: 'rgba(123,196,184,0.18)',
  danger: '#E56B6F',
  shadowSm: '0 1px 2px rgba(0,0,0,0.06)',
  shadowMd: '0 8px 24px rgba(0,0,0,0.08)',
  shadowLg: '0 18px 40px rgba(15,23,42,0.08)',
};

const resolveTone = (color?: string) => {
  if (color === 'danger') {
    return {
      filled: TOKENS.danger,
      hover: '#D95A60',
      light: 'rgba(229,107,111,0.14)',
      lightHover: 'rgba(229,107,111,0.2)',
      text: TOKENS.danger,
    };
  }

  if (color === 'gray') {
    return {
      filled: '#9CA3AF',
      hover: '#6B7280',
      light: 'rgba(107,114,128,0.12)',
      lightHover: 'rgba(107,114,128,0.18)',
      text: '#6B7280',
    };
  }

  return {
    filled: TOKENS.primary,
    hover: TOKENS.primaryHover,
    light: TOKENS.primarySoftBg,
    lightHover: 'rgba(123,196,184,0.24)',
    text: TOKENS.primaryHover,
  };
};

export const appTheme: MantineThemeOverride = {
  colorScheme: 'light',
  primaryColor: 'sage',
  primaryShade: 6,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSizes: {
    xs: '0.6875rem',
    sm: '0.8125rem',
    md: '0.9375rem',
    lg: '1.0625rem',
    xl: '1.1875rem',
  },
  spacing: {
    xs: '0.5rem',
    sm: '0.625rem',
    md: '0.875rem',
    lg: '1.125rem',
    xl: '1.5rem',
  },
  headings: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: 600,
    sizes: {
      h1: {
        fontSize: '2rem',
        lineHeight: 1.15,
      },
      h2: {
        fontSize: '1.45rem',
        lineHeight: 1.2,
      },
      h3: {
        fontSize: '1.2rem',
        lineHeight: 1.25,
      },
    },
  },
  defaultRadius: 'lg',
  colors: {
    sage: [
      '#F1FBF9',
      '#DFF5F0',
      '#CBECE4',
      '#B5E0D6',
      '#9AD4C8',
      '#87CCC0',
      '#7BC4B8',
      '#6BBAB0',
      '#5FAFA3',
      '#4E978D',
    ],
    danger: [
      '#FFF1F3',
      '#FFE0E5',
      '#F8C7D0',
      '#F0ACB7',
      '#E88A98',
      '#E35D6A',
      '#D24F5D',
      '#BC4552',
      '#A23D48',
      '#87343D',
    ],
    gray: [
      '#F9FAFB',
      '#F3F4F6',
      '#E5E7EB',
      '#D1D5DB',
      '#9CA3AF',
      '#6B7280',
      '#4B5563',
      '#374151',
      '#1F2937',
      '#111827',
    ],
  },
  shadows: {
    xs: TOKENS.shadowSm,
    sm: TOKENS.shadowSm,
    md: TOKENS.shadowMd,
    xl: TOKENS.shadowLg,
  },
  components: {
    AppShell: {
      styles: {
        main: {
          background: TOKENS.pageBg,
          color: TOKENS.text,
        },
      },
    },
    Header: {
      styles: {
        root: {
          background: 'rgba(255,255,255,0.82)',
          borderBottom: `1px solid ${TOKENS.border}`,
          boxShadow: TOKENS.shadowSm,
          backdropFilter: 'blur(14px)',
        },
      },
    },
    Navbar: {
      styles: {
        root: {
          background: 'rgba(255,255,255,0.86)',
          borderRight: `1px solid ${TOKENS.border}`,
          backdropFilter: 'blur(14px)',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        shadow: 'sm',
        padding: 'sm',
      },
      styles: {
        root: {
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.92))',
          borderColor: TOKENS.border,
          boxShadow: TOKENS.shadowSm,
        },
      },
    },
    Paper: {
      styles: {
        root: {
          background: TOKENS.cardBg,
          borderColor: TOKENS.border,
        },
      },
    },
    Title: {
      styles: {
        root: {
          color: TOKENS.text,
          letterSpacing: '-0.02em',
          fontWeight: 650,
        },
      },
    },
    Text: {
      styles: {
        root: {
          color: TOKENS.text,
        },
      },
    },
    Button: {
      defaultProps: {
        color: 'sage',
        radius: 'lg',
        size: 'sm',
      },
      styles: (_theme, params) => {
        const tone = resolveTone(params.color);
        return {
          root: {
            fontWeight: 600,
            letterSpacing: '-0.01em',
            boxShadow: TOKENS.shadowSm,
            transition: 'transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease',
            background:
              params.variant === 'filled'
                ? tone.filled
                : params.variant === 'subtle' || params.variant === 'light'
                  ? tone.light
                  : undefined,
            color:
              params.variant === 'filled'
                ? '#FFFFFF'
                : params.variant === 'subtle' || params.variant === 'light'
                  ? tone.text
                  : undefined,
            '&:hover': {
              transform: 'translateY(-1px)',
              boxShadow: TOKENS.shadowMd,
              background:
                params.variant === 'filled'
                  ? tone.hover
                  : params.variant === 'subtle' || params.variant === 'light'
                    ? tone.lightHover
                    : undefined,
            },
          },
        };
      },
    },
    Input: {
      defaultProps: {
        radius: 'lg',
        size: 'sm',
      },
      styles: {
        input: {
          background: TOKENS.cardBg,
          borderColor: TOKENS.border,
          color: TOKENS.text,
          '&:focus, &:focus-within': {
            borderColor: TOKENS.primary,
            boxShadow: `0 0 0 3px ${TOKENS.primarySoftBg}`,
          },
        },
      },
    },
    InputWrapper: {
      styles: {
        label: {
          color: TOKENS.text,
          fontWeight: 600,
        },
        description: {
          color: TOKENS.mutedText,
        },
        error: {
          color: TOKENS.danger,
        },
      },
    },
    SegmentedControl: {
      defaultProps: {
        color: 'sage',
        radius: 'lg',
        size: 'sm',
      },
      styles: {
        root: {
          background: 'rgba(0,0,0,0.035)',
          border: `1px solid ${TOKENS.border}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        },
        indicator: {
          background: TOKENS.primary,
          boxShadow: TOKENS.shadowSm,
        },
        label: {
          color: TOKENS.mutedText,
          fontWeight: 600,
        },
        labelActive: {
          color: '#FFFFFF',
        },
      },
    },
    Badge: {
      defaultProps: {
        color: 'sage',
        variant: 'light',
      },
      styles: (_theme, params) => {
        const tone = resolveTone(params.color);
        return {
          root: {
            background: tone.light,
            color: tone.text,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            border: `1px solid ${TOKENS.border}`,
          },
        };
      },
    },
    NavLink: {
      defaultProps: {
        color: 'sage',
      },
      styles: {
        root: {
          borderRadius: 14,
          color: TOKENS.text,
          transition: 'background-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
          '&:hover': {
            background: 'rgba(123,196,184,0.08)',
            transform: 'translateX(2px)',
          },
          '&[data-active]': {
            background: TOKENS.primarySoftBg,
            color: TOKENS.primaryHover,
            boxShadow: 'inset 0 0 0 1px rgba(123,196,184,0.14)',
          },
        },
      },
    },
    Accordion: {
      styles: {
        item: {
          borderColor: TOKENS.border,
          background: TOKENS.cardBg,
          boxShadow: TOKENS.shadowSm,
        },
      },
    },
    Chip: {
      defaultProps: {
        color: 'sage',
      },
    },
    Alert: {
      defaultProps: {
        color: 'sage',
        radius: 'lg',
      },
      styles: {
        root: {
          borderColor: TOKENS.border,
          boxShadow: TOKENS.shadowSm,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.94))',
        },
      },
    },
    Drawer: {
      styles: {
        header: {
          background: TOKENS.cardBg,
          borderBottom: `1px solid ${TOKENS.border}`,
        },
        body: {
          background: TOKENS.pageBg,
        },
      },
    },
  },
};

export default appTheme;
