def test_selftest_module_imports():
    from app.selftest import get_status, DEFAULT_URL
    st = get_status()
    assert st.enabled in (True, False)
    assert "youtube" in DEFAULT_URL
