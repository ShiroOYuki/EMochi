"""PyInstaller 的進入點（打包成 emochi-server.exe）：參數同 python -m app"""
from app.__main__ import main

if __name__ == "__main__":
    main()
