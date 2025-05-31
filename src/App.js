import React, { useState, useEffect } from 'react';
import './App.css';
import SideMenu from './components/SideMenu';
import ClientManager from './components/ClientManager';
import PackageManager from './components/PackageManager';
import Agendamentos from './components/Agendamentos';
import ClienteConsultaView from './components/ClienteConsultaView';
import HorariosFixos from './components/HorariosFixos';
import ControleAtendimentosView from './components/ControleAtendimentosView';
import AgendaVisual from './components/AgendaVisual';
// import Configuracoes from './components/Configuracoes'; // Se você tiver este componente
import { Box, CssBaseline, IconButton, Toolbar, Typography, AppBar as MuiAppBar, useMediaQuery } from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';

// Seu tema existente ou um novo
const theme = createTheme({
  palette: {
    primary: {
      main: '#00695f',
    },
    secondary: {
      main: '#f57c00',
    },
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h5: {
      fontWeight: 700,
    },
    button: {
      textTransform: 'none',
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
     MuiDrawer: { // Estilos para o Drawer (SideMenu)
      styleOverrides: {
        paper: {
          backgroundColor: '#004d40', // Exemplo de cor de fundo escura
          color: '#e0f2f1', // Exemplo de cor de texto clara
        }
      }
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          // fontWeight: 500, // Se quiser o texto do menu um pouco mais forte
        }
      }
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#b2dfdb', // Cor dos ícones no menu
        }
      }
    }
  }
});

const DRAWER_WIDTH = 240;

function App() {
  // Mantendo o estado original se for baseado em índice, ou mude para string se preferir
  const [selectedMenu, setSelectedMenu] = useState(6); // AgendaVisual como padrão
  const [mobileOpen, setMobileOpen] = useState(false);
  const muiTheme = useTheme(); // Para usar dentro do App, já que ThemeProvider está aqui
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md')); // 'md' é um bom breakpoint para mobile/tablet

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Fecha o drawer se a tela for redimensionada para desktop enquanto ele estiver aberto
  useEffect(() => {
    if (!isMobile && mobileOpen) {
      setMobileOpen(false);
    }
  }, [isMobile, mobileOpen]);

  const renderContent = () => {
    switch (selectedMenu) {
      case 0: return <ClientManager />;
      case 1: return <PackageManager />;
      case 2: return <Agendamentos />;
      case 3: return <ClienteConsultaView />;
      case 4: return <HorariosFixos />;
      case 5: return <ControleAtendimentosView />;
      case 6: return <AgendaVisual />;
      // case 7: return <Configuracoes />; // Se existir
      default: return <AgendaVisual />; // Padrão para AgendaVisual
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        {isMobile && (
          <MuiAppBar
            position="fixed"
            sx={{
              zIndex: (themeRef) => themeRef.zIndex.drawer + 1, // Para ficar acima do Drawer
              backgroundColor: theme.palette.primary.main, // Garante a cor do AppBar
            }}
          >
            <Toolbar>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 2 }}
              >
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" noWrap component="div">
                Le Renovare
              </Typography>
            </Toolbar>
          </MuiAppBar>
        )}
        <SideMenu
          menu={selectedMenu}
          setMenu={setSelectedMenu}
          isMobile={isMobile}
          mobileOpen={mobileOpen}
          handleDrawerToggle={handleDrawerToggle}
          drawerWidth={DRAWER_WIDTH}
        />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, // Largura total menos o drawer em desktop
            ml: { md: `${DRAWER_WIDTH}px` }, // Margin à esquerda para o drawer em desktop
            mt: { xs: '64px', md: 0 }, // Margin no topo para o AppBar em mobile (altura padrão do Toolbar é 64px ou 56px)
          }}
        >
          {/* Toolbar fantasma para empurrar o conteúdo para baixo do AppBar fixo em mobile */}
          {isMobile && <Toolbar />} 
          {renderContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;