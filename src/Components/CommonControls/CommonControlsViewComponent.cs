using Microsoft.AspNetCore.Mvc;

namespace VoiceAgentCSharp.Components
{
    public class CommonControlsViewComponent : ViewComponent
    {
        public IViewComponentResult Invoke(bool? isIndex = null)
        {
            isIndex ??= ViewContext.RouteData.Values["page"]?.ToString() == "/Index";
            return View(new CommonControlsViewModel { IsIndex = isIndex.Value });
        }
    }

    public class CommonControlsViewModel
    {
        public bool IsIndex { get; set; }
    }
}
